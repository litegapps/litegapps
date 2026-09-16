"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, logout } from "@/lib/session";
import { startJob, runningJob } from "@/lib/jobs";
import { writeConfigDoc } from "@/lib/config";
import { moveEntry, removeEntry, renameEntry } from "@/lib/files";
import { AUTO_BACKUP, setSetting } from "@/lib/settings";
import { readOverrides, writeOverrides } from "@/lib/buildtargets";
import { PACKAGE_LISTS, readPackageLists, writePackageLists } from "@/lib/packages";
import { readSinglePrefs, writeBatchPrefs, writeSinglePrefs } from "@/lib/formstate";
import { PANEL_KEYS, readPanelConfig, writePanelConfig } from "@/lib/panelconfig";
import type { JobKind } from "@/lib/targets";

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
	await rememberForm(kind, formData);

	let id: number;
	try {
		id = await startJob({
			// Read here, not in the browser: the form only says "follow the
			// stored config", never which variants that turns into.
			overrides: kind === "build-batch" ? await readOverrides() : undefined,
			packages: kind === "build-batch" || kind === "make" ? await readPackageLists() : undefined,
			// Identity and version come from the panel, never from the repo file.
			config: await readPanelConfig(),
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
	if (!["/", "/restore", "/backup", "/info"].includes(url.pathname)) return "/";
	// Keep the Build page's tab, so a job started on one tab returns to it.
	const tab = url.searchParams.get("tab");
	if (url.pathname === "/" && tab && !["single", "config"].includes(tab)) {
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

/** On/off switch for the daily backup (src/lib/scheduler.ts does the work). */
export async function toggleAutoBackupAction(formData: FormData) {
	await requireAdmin();
	await setSetting(AUTO_BACKUP, formData.get("on") ? "1" : "0");
	revalidatePath("/backup");
	redirect("/backup");
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
async function rememberForm(kind: string, formData: FormData) {
	try {
		if (kind === "build-batch") {
			await writeBatchPrefs({
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

export async function logoutAction() {
	await logout();
	redirect("/login");
}
