"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, logout } from "@/lib/session";
import { startJob, runningJob, stopJob, clearJobs, SOURCE_KINDS } from "@/lib/jobs";
import { writeConfigDoc } from "@/lib/config";
import { moveEntry, removeEntry, renameEntry } from "@/lib/files";
import {
	ADDONAPI_DAYS,
	ADDONAPI_DAYS_MAX,
	ADDONAPI_LAST,
	ADDONAPI_ON,
	RELEASEAPI_LAST,
	AUTO_BACKUP,
	RELEASE_KEEP,
	RELEASE_KEEP_MAX,
	MIRROR_DIR,
	MIRROR_DIR_RE,
	MIRROR_REMOTE,
	MIRROR_REMOTE_RE,
	RELEASE_PRUNE,
	AUTOBUILD_DAY,
	AUTOBUILD_HOUR,
	AUTOBUILD_LAST,
	AUTOBUILD_ON,
	month,
	readAutoBuild,
	readMirror,
	readRetention,
	readSource,
	SOURCE_PREFER,
	setSetting,
} from "@/lib/settings";
import { readOverrides, writeOverrides } from "@/lib/buildtargets";
import { PACKAGE_LISTS, readPackageLists, writePackageLists } from "@/lib/packages";
import { readSinglePrefs, writeAutoPrefs, writeBatchPrefs, writeSinglePrefs } from "@/lib/formstate";
import { PANEL_KEYS, readPanelConfig, writePanelConfig } from "@/lib/panelconfig";
import { HISTORY_BATCH, HISTORY_SINGLE, type JobKind } from "@/lib/targets";

/*
 * Server Actions are public endpoints, so each one re-checks the session.
 * A logged-out caller must never be able to start a build by posting here.
 */
async function requireAdmin() {
	if (!(await currentUser())) redirect("/login");
}

export async function startJobAction(formData: FormData) {
	await requireAdmin();

	const kind = String(formData.get("kind") ?? "") as JobKind;
	const back = backPath(String(formData.get("back") ?? "/"));
	// Remember the selection before anything can fail, so a refused run still
	// comes back with the same form filled in.
	const auto = formData.get("profile") === "auto";
	await rememberForm(kind, formData, auto);

	let id: number;
	try {
		id = await startJob({
			// Read here, not in the browser: the form only says "follow the
			// stored config", never which variants that turns into.
			overrides: kind === "build-batch" ? await readOverrides() : undefined,
			packages: kind === "build-batch" || kind === "make" ? await readPackageLists() : undefined,
			// Identity and version come from the panel, never from the repo file.
			config: await readPanelConfig(),
			retention: kind === "build-batch" ? await readRetention() : undefined,
			source: SOURCE_KINDS.has(kind) ? await readSource() : undefined,
			// Which Drive the mirror jobs write to (Mirror page settings).
			mirror: kind.startsWith("mirror-") ? await readMirror() : undefined,
			path: String(formData.get("path") ?? "") || undefined,
			auto: auto || undefined,
			kind,
			variant: String(formData.get("variant") ?? "") || undefined,
			name: String(formData.get("name") ?? "") || undefined,
			variants: formData.getAll("variants").map(String),
			targets: formData.getAll("targets").map(String),
			restoreMissing: formData.get("restoreMissing") === "on",
			cleanAfter: formData.get("cleanAfter") === "on",
			buildAddon: formData.get("buildAddon") === "on",
			upload: formData.get("upload") === "on",
			arch: String(formData.get("arch") ?? "") || undefined,
			sdk: String(formData.get("sdk") ?? "") || undefined,
		});
	} catch (e) {
		const reason = e instanceof Error ? e.message : "unknown error";
		redirect(withParam(back, "error", reason));
	}

	// A full File API run from the page restarts its automatic interval.
	if ((kind === "addon-api" || kind === "release-api") && !formData.get("arch")) {
		await setSetting(kind === "addon-api" ? ADDONAPI_LAST : RELEASEAPI_LAST, new Date().toISOString());
	}

	revalidatePath(back.split("?")[0]);
	// The terminal dialog opens on this id, so even a job that finishes in a
	// second still shows its output.
	redirect(withParam(back, "job", String(id)));
}

/*
 * Where to land after starting a job. Only the panel's own pages are
 * accepted, so the hidden form field cannot turn this into an open redirect.
 */
function backPath(raw: string): string {
	const url = new URL(raw, "http://panel.invalid");
	if (url.origin !== "http://panel.invalid") return "/";
	if (!["/", "/restore", "/backup", "/info", "/mirror", "/file-api"].includes(url.pathname)) return "/";
	// Keep the Build page's tab, so a job started on one tab returns to it.
	const tab = url.searchParams.get("tab");
	if (url.pathname === "/" && tab && !["single", "config", "settings", "auto"].includes(tab)) {
		url.searchParams.delete("tab");
	}
	url.searchParams.delete("error");
	return url.pathname + url.search;
}

function withParam(back: string, key: string, value: string): string {
	const url = new URL(back, "http://panel.invalid");
	url.searchParams.set(key, value);
	return url.pathname + url.search;
}

/*
 * Save one shell config file. Values go through writeConfigDoc, which only
 * rewrites keys the file already has; a build in flight blocks the save
 * because build.sh reads these files while it runs.
 */
export async function saveConfigAction(formData: FormData) {
	await requireAdmin();

	const id = String(formData.get("id") ?? "");
	const back = `/config?id=${encodeURIComponent(id)}`;

	// redirect() works by throwing, so it stays outside the try
	let target: string;
	try {
		if (await runningJob()) throw new Error("ada job berjalan, tunggu sampai selesai");
		const values: Record<string, string> = {};
		for (const [k, v] of formData.entries()) {
			if (k.startsWith("v:")) values[k.slice(2)] = String(v);
		}
		const changed = await writeConfigDoc(id, values);
		target = changed.length ? withParam(back, "saved", changed.join(", ")) : back;
	} catch (e) {
		target = withParam(back, "error", e instanceof Error ? e.message : "unknown error");
	}

	revalidatePath("/config");
	revalidatePath("/");
	redirect(target);
}

/*
 * File manager actions. Paths are validated in lib/files (resolved inside the
 * repo, blocklist for .git/.env/.ssh/node_modules); everything here does is
 * pick the message and send the browser back to the folder it came from.
 */
async function fileAction(
	formData: FormData,
	run: (path: string) => Promise<string>,
): Promise<never> {
	await requireAdmin();

	const dir = String(formData.get("dir") ?? "");
	const back = `/files?path=${encodeURIComponent(dir)}`;
	const rel = String(formData.get("path") ?? "");

	let target: string;
	try {
		target = withParam(back, "done", await run(rel));
	} catch (e) {
		target = withParam(back, "error", e instanceof Error ? e.message : "gagal");
	}

	revalidatePath("/files");
	redirect(target);
}

export async function fileDeleteAction(formData: FormData) {
	return fileAction(formData, async (rel) => {
		await removeEntry(rel);
		return `Dihapus: ${rel}`;
	});
}

export async function fileRenameAction(formData: FormData) {
	const name = String(formData.get("name") ?? "");
	return fileAction(formData, async (rel) => {
		const next = await renameEntry(rel, name);
		return `Diganti nama: ${rel} → ${next}`;
	});
}

export async function fileMoveAction(formData: FormData) {
	const dest = String(formData.get("dest") ?? "");
	return fileAction(formData, async (rel) => {
		const next = await moveEntry(rel, dest);
		return `Dipindah: ${rel} → ${next}`;
	});
}

/** File API: automatic refresh every N days (src/lib/scheduler.ts does the work). */
export async function saveAddonApiAutoAction(formData: FormData) {
	await requireAdmin();
	const days = Number(formData.get("days"));
	if (!Number.isInteger(days) || days < 1 || days > ADDONAPI_DAYS_MAX) {
		redirect(withParam("/file-api", "error", `interval harus 1-${ADDONAPI_DAYS_MAX} hari`));
	}
	await setSetting(ADDONAPI_ON, formData.get("on") ? "1" : "0");
	await setSetting(ADDONAPI_DAYS, String(days));
	revalidatePath("/file-api");
	redirect(withParam("/file-api", "done", "Jadwal File API disimpan"));
}

/** On/off switch for the daily backup (src/lib/scheduler.ts does the work). */
export async function toggleAutoBackupAction(formData: FormData) {
	await requireAdmin();
	await setSetting(AUTO_BACKUP, formData.get("on") ? "1" : "0");
	revalidatePath("/backup");
	redirect("/backup");
}

/*
 * Build > Multi / Single: wipe that tab's job history and its logs, then run
 * web/clear-output.sh to delete the built zips and build logs as well. The
 * zips are gone for good, so the button asks first; a running job blocks it,
 * since its row is what guards the tree.
 */
export async function clearBuildDataAction(formData: FormData) {
	await requireAdmin();
	const back = backPath(String(formData.get("back") ?? "/"));
	const group = String(formData.get("group") ?? "") === "single" ? HISTORY_SINGLE : HISTORY_BATCH;

	if (await runningJob()) {
		redirect(withParam(back, "error", "Ada job berjalan - hentikan dulu sebelum membersihkan"));
	}

	const gone = await clearJobs(group);

	let id: number;
	try {
		id = await startJob({ kind: "clear-output" });
	} catch (e) {
		const reason = e instanceof Error ? e.message : "unknown error";
		redirect(withParam(back, "error", reason));
	}
	revalidatePath(back.split("?")[0]);
	redirect(withParam(withParam(back, "done", `${gone} riwayat job dihapus`), "job", String(id)));
}

/*
 * Mirror page: which rclone remote and folder the Google Drive mirror writes
 * to. Both are checked here as well as in the script - this is a public
 * endpoint, and they end up on an rclone command line.
 */
export async function saveMirrorAction(formData: FormData) {
	await requireAdmin();
	const target = "/mirror";
	const remote = String(formData.get("remote") ?? "").trim();
	const dir = String(formData.get("dir") ?? "").trim();

	if (!MIRROR_REMOTE_RE.test(remote)) {
		redirect(withParam(target, "error", "Nama remote hanya huruf, angka, - dan _"));
	}
	if (!MIRROR_DIR_RE.test(dir)) {
		redirect(withParam(target, "error", "Folder Drive tidak boleh diawali / atau memuat .."));
	}
	await setSetting(MIRROR_REMOTE, remote);
	await setSetting(MIRROR_DIR, dir);
	revalidatePath(target);
	redirect(withParam(target, "done", "Tujuan mirror disimpan"));
}

/*
 * Build > Multi: the monthly auto build. The switch posts on its own (no
 * "keepOn"); the schedule button posts day/hour with keepOn set to
 * the switch's current state.
 */
export async function saveAutoBuildAction(formData: FormData) {
	await requireAdmin();
	const day = Number(formData.get("day"));
	const hour = Number(formData.get("hour"));
	if (!Number.isInteger(day) || day < 1 || day > 28 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
		redirect(withParam("/", "error", "Tanggal harus 1-28 dan jam 0-23"));
	}
	const on = formData.get("on") === "on" || formData.get("keepOn") === "1";
	const was = await readAutoBuild();
	// Switching it on (or moving the slot) after this month's slot has passed
	// must not start a build right away: the scheduler catches up on a missed
	// slot, so the month is marked done and the first run is the next slot.
	const now = new Date();
	const passed = now.getDate() > day || (now.getDate() === day && now.getHours() >= hour);
	if (on && passed && (!was.on || was.day !== day || was.hour !== hour)) {
		await setSetting(AUTOBUILD_LAST, month(now));
	}
	await setSetting(AUTOBUILD_ON, on ? "1" : "0");
	await setSetting(AUTOBUILD_DAY, String(day));
	await setSetting(AUTOBUILD_HOUR, String(hour));
	revalidatePath("/");
	redirect(withParam("/", "done", on ? `Auto build aktif: tiap tanggal ${day} jam ${String(hour).padStart(2, "0")}:00` : "Auto build dimatikan"));
}

/* Build > Settings: which server restores download sources from. */
export async function saveSourceAction(formData: FormData) {
	await requireAdmin();
	const prefer = String(formData.get("prefer") ?? "") === "drive" ? "drive" : "sf";
	await setSetting(SOURCE_PREFER, prefer);
	revalidatePath("/");
	redirect(
		withParam(
			"/?tab=settings",
			"done",
			prefer === "drive" ? "Restore memakai Google Drive (cadangan SourceForge)" : "Restore memakai SourceForge",
		),
	);
}

/*
 * Build > Settings: SourceForge release retention. The switch submits on its
 * own; the count is validated here because the form is a public endpoint.
 */
export async function saveRetentionAction(formData: FormData) {
	await requireAdmin();
	const target = "/?tab=settings";
	const keep = Number(formData.get("keep"));
	if (!Number.isInteger(keep) || keep < 1 || keep > RELEASE_KEEP_MAX) {
		redirect(withParam(target, "error", `Jumlah rilis harus 1-${RELEASE_KEEP_MAX}`));
	}
	await setSetting(RELEASE_PRUNE, formData.get("on") ? "1" : "0");
	await setSetting(RELEASE_KEEP, String(keep));
	revalidatePath("/");
	redirect(withParam(target, "done", "Pengaturan disimpan"));
}

/*
 * Save the per-target variant config (Build > Config target). Entries come in
 * as "<arch>-<sdk>=<variant,...>"; writeOverrides drops the ones that match
 * the default so the table only holds real changes.
 */
export async function saveBuildTargetsAction(formData: FormData) {
	await requireAdmin();

	const next: Record<string, string[]> = {};
	for (const raw of formData.getAll("target").map(String)) {
		const [key, list] = raw.split("=");
		if (!key) continue;
		next[key] = (list ?? "").split(",").filter(Boolean);
	}

	let target = "/?tab=config";
	try {
		const n = await writeOverrides(next);
		target = withParam(target, "done", `Config target disimpan (${n} target diatur sendiri)`);
	} catch (e) {
		target = withParam(target, "error", e instanceof Error ? e.message : "gagal menyimpan");
	}

	revalidatePath("/");
	redirect(target);
}

/*
 * Save the per-variant package lists (Build > Config target). The build reads
 * them from the environment, so nothing here writes into the repo.
 */
export async function savePackagesAction(formData: FormData) {
	await requireAdmin();

	const next: Record<string, string[]> = {};
	for (const name of PACKAGE_LISTS) {
		const raw = formData.get(`pkg:${name}`);
		if (raw === null) continue;
		next[name] = String(raw).split(/[\s,]+/).filter(Boolean);
	}

	let target = "/?tab=config";
	try {
		const n = await writePackageLists(next);
		target = withParam(target, "done", `Daftar paket disimpan (${n} daftar diubah dari bawaan)`);
	} catch (e) {
		target = withParam(target, "error", e instanceof Error ? e.message : "gagal menyimpan");
	}

	revalidatePath("/");
	redirect(target);
}

/** Persist what the build forms were set to, for the next visit. */
async function rememberForm(kind: string, formData: FormData, auto = false) {
	try {
		if (kind === "build-batch") {
			await (auto ? writeAutoPrefs : writeBatchPrefs)({
				targets: formData.getAll("targets").map(String),
				restoreMissing: formData.get("restoreMissing") === "on",
				cleanAfter: formData.get("cleanAfter") === "on",
				buildAddon: formData.get("buildAddon") === "on",
				upload: formData.get("upload") === "on",
			});
			return;
		}
		if (["make", "packages", "restore", "status", "clean"].includes(kind)) {
			const prev = await readSinglePrefs();
			await writeSinglePrefs({
				kind,
				variant: String(formData.get("variant") ?? "") || prev.variant,
				arch: String(formData.get("arch") ?? "") || prev.arch,
				sdk: String(formData.get("sdk") ?? "") || prev.sdk,
			});
		}
	} catch {
		// A preference that cannot be stored must never stop a build.
	}
}

/*
 * Save the panel's identity and version (Build > Config target). These live in
 * the database and are passed to jobs as LG_CFG_*, so the repo `config` can
 * stay a neutral default for everyone who clones it.
 */
export async function savePanelConfigAction(formData: FormData) {
	await requireAdmin();

	const next: Record<string, string> = {};
	for (const k of PANEL_KEYS) {
		const raw = formData.get(`cfg:${k}`);
		if (raw !== null) next[k] = String(raw);
	}

	let target = "/?tab=config";
	try {
		const n = await writePanelConfig(next);
		target = withParam(target, "done", `Identitas panel disimpan (${n} nilai dipakai)`);
	} catch (e) {
		target = withParam(target, "error", e instanceof Error ? e.message : "gagal menyimpan");
	}

	revalidatePath("/");
	redirect(target);
}

/** Stop a running job from its terminal panel. */
export async function stopJobAction(formData: FormData) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const id = Number(formData.get("id"));
	const back = backPath(String(formData.get("back") ?? "/"));

	let target = withParam(back, "job", String(id));
	try {
		if (!Number.isInteger(id) || id < 1) throw new Error("job tidak valid");
		await stopJob(id, user);
	} catch (e) {
		target = withParam(target, "error", e instanceof Error ? e.message : "gagal menghentikan job");
	}

	revalidatePath(back.split("?")[0]);
	redirect(target);
}

export async function logoutAction() {
	await logout();
	redirect("/login");
}
