import { spawn } from "node:child_process";
import { openSync, closeSync, mkdirSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db, ensureSchema } from "./db";
import { repoRoot, jobLogDir } from "./paths";
import { findBuildProcesses } from "./procs";
import {
	ARCHS,
	BACKUP_NAME,
	SDKS,
	UNSUPPORTED_MSG,
	VARIANTS,
	targetSupported,
} from "./targets";
import { parseTargetKey, targetSpec } from "./buildtargets";
import { packageEnv } from "./packages";
import { panelConfigEnv } from "./panelconfig";
import type { Job, JobRequest } from "./targets";

export { ARCHS, SDKS, VARIANTS, ANDROID } from "./targets";
export type { Job, JobKind, JobRequest } from "./targets";

/*
 * Job runner.
 *
 * The panel never reimplements build or upload logic: it shells out to the
 * scripts that already own it (build.sh, packages/make, web/make-status.sh).
 * Commands are built from a fixed allowlist and passed to spawn() as an argv
 * array with no shell, so nothing a form can submit is ever interpreted.
 */

type Plan = { argv: string[]; label: string; env?: Record<string, string> };

/*
 * Jobs that read the build config get the panel's identity and version as
 * LG_CFG_* (see lib/panelconfig), so the repo's `config` stays neutral.
 */
const CONFIG_KINDS = new Set<string>([
	"make", "build-batch", "packages", "restore", "restore-gapps", "restore-bin", "status",
]);

/** Placeholder in a plan's argv, replaced with the job's own id in startJob. */
const JOB_ID_TOKEN = "__JOB_ID__";

/** Turn a request into an argv array, or throw if anything is off the allowlist. */
function plan(req: JobRequest): Plan {
	const arch = req.arch ?? "";
	const sdk = req.sdk ?? "";
	const variant = req.variant ?? "";

	const needArch = () => {
		if (!(ARCHS as readonly string[]).includes(arch)) throw new Error(`bad arch: ${arch}`);
	};
	const needSdk = () => {
		if (!(SDKS as readonly number[]).includes(Number(sdk))) throw new Error(`bad sdk: ${sdk}`);
	};
	// Anything that restores or builds a target must also be a target the
	// project still supports (see targetSupported in targets.ts).
	const needSupported = () => {
		if (!targetSupported(arch, sdk)) throw new Error(UNSUPPORTED_MSG);
	};
	const needVariant = () => {
		if (!(VARIANTS as readonly string[]).includes(variant)) {
			throw new Error(`bad variant: ${variant}`);
		}
	};

	switch (req.kind) {
		case "make":
			needVariant(); needArch(); needSdk(); needSupported();
			return {
				argv: ["bash", "build.sh", "make", "litegapps", variant, arch, sdk],
				label: `make ${variant} ${arch} sdk ${sdk}`,
				env: packageEnv(req.packages ?? {}),
			};
		case "packages":
			needArch(); needSdk(); needSupported();
			return {
				argv: ["bash", "packages/make", "make", arch, sdk],
				label: `packages ${arch} sdk ${sdk}`,
			};
		case "restore":
			return { argv: ["sh", "build.sh", "restore"], label: "restore" };
		case "restore-bin":
			return { argv: ["sh", "build.sh", "restore", "bin"], label: "restore bin" };
		case "restore-package":
			needArch(); needSdk(); needSupported();
			return {
				argv: ["bash", "packages/make", "restore", arch, sdk],
				label: `restore package ${arch} sdk ${sdk}`,
			};
		case "restore-gapps": {
			needArch(); needSdk(); needSupported();
			const list = [...new Set(req.variants ?? [])];
			if (!list.length) throw new Error("pick at least one variant");
			for (const v of list) {
				if (!(VARIANTS as readonly string[]).includes(v)) throw new Error(`bad variant: ${v}`);
			}
			// build.sh restores bin.zip first, then each variant's gapps zip.
			return {
				argv: ["sh", "build.sh", "restore", "litegapps", list.join(","), arch, sdk],
				label: `restore gapps ${list.join(",")} ${arch} sdk ${sdk}`,
			};
		}
		case "build-batch": {
			// Targets are ticked one by one in the checklist ("<arch>-<sdk>");
			// their variants are never chosen here - they come from the panel's
			// per-target config, with the built-in default as fallback.
			const targets = [...new Set(req.targets ?? [])]
				.map(parseTargetKey)
				.filter((t): t is { arch: string; sdk: number } => t !== null)
				.sort((a, b) => a.arch.localeCompare(b.arch) || b.sdk - a.sdk);
			if (!targets.length) throw new Error("pilih minimal satu target");
			const unsupported = targets.filter((t) => !targetSupported(t.arch, t.sdk));
			if (unsupported.length) {
				throw new Error(
					`${UNSUPPORTED_MSG}: ${unsupported.map((t) => `${t.arch}/${t.sdk}`).join(", ")}`,
				);
			}

			const spec = targetSpec(targets, req.overrides ?? {});
			const count = spec
				.split(";")
				.filter(Boolean)
				.reduce((n, part) => n + part.split("=")[1].split(",").filter(Boolean).length, 0);

			return {
				argv: [
					"bash", "web/build-batch.sh", spec,
					req.restoreMissing === false ? "0" : "1",
					req.cleanAfter ? "1" : "0",
					req.buildAddon ? "1" : "0",
					req.upload ? "1" : "0",
				],
				label:
					`build ${count} zip · ${targets.length} target` +
					(req.buildAddon ? " · addon" : "") +
					(req.upload ? " · upload SF" : ""),
				env: packageEnv(req.packages ?? {}),
			};
		}
		case "clean-sources":
			needArch(); needSdk();
			return {
				argv: ["bash", "web/clean-sources.sh", arch, sdk],
				label: `clean sources ${arch} sdk ${sdk}`,
			};
		case "clean":
			return { argv: ["sh", "build.sh", "clean"], label: "clean" };
		case "status":
			return { argv: ["bash", "web/make-status.sh"], label: "refresh status.json" };
		default:
			throw new Error(`unknown job kind: ${req.kind}`);
	}
}

/*
 * Job kinds that touch the build tree. Starting a second one while something
 * is already building would have two processes writing the same output/,
 * log/ and gapps directories.
 */
const BUILD_KINDS = new Set<string>([
	"make", "packages", "build-batch",
	"restore", "restore-bin", "restore-package", "restore-gapps",
	"clean", "clean-sources",
]);

/** Only one build may run at a time — they share output/ and log/. */
export async function runningJob(): Promise<Job | null> {
	await reconcile();
	const [rows] = await db().query<RowDataPacket[]>(
		"SELECT * FROM jobs WHERE status = 'running' ORDER BY id DESC LIMIT 1",
	);
	return rows.length ? (rows[0] as Job) : null;
}

export async function startJob(req: JobRequest): Promise<number> {
	await ensureSchema();

	const busy = await runningJob();
	if (busy) throw new Error(`ada job lain yang sedang berjalan: ${busy.label} (#${busy.id})`);

	if (BUILD_KINDS.has(req.kind)) {
		// Nothing in the database, but something may still be building - a job
		// started with docker exec, or one whose row was restored away.
		const foreign = await findBuildProcesses();
		if (foreign.length) {
			throw new Error(
				`ada proses build lain di VPS: pid ${foreign[0].pid} (${foreign[0].cmd}) — tunggu sampai selesai`,
			);
		}
	}

	const { argv: planned, label, env: planEnv } = plan(req);
	const configEnv = CONFIG_KINDS.has(req.kind) ? panelConfigEnv(req.config ?? {}) : {};
	const root = repoRoot();
	const dir = jobLogDir();
	mkdirSync(dir, { recursive: true });

	const c = db();
	const [res] = await c.query<ResultSetHeader>(
		"INSERT INTO jobs (kind, label, argv, log_file) VALUES (?, ?, ?, '')",
		[req.kind, label, planned.join(" ")],
	);
	const id = res.insertId;
	const argv = planned.map((a) => (a === JOB_ID_TOKEN ? String(id) : a));
	const logFile = path.join(dir, `${id}.log`);
	const exitFile = path.join(dir, `${id}.exit`);

	const fd = openSync(/*turbopackIgnore: true*/ logFile, "a");

	/*
	 * Build jobs also take a real file lock, as the last line of defence: two
	 * of them can only overlap if both the database check and the process scan
	 * missed, and then the second one stops at once instead of corrupting a
	 * build. Jobs that do not touch the build tree (status refresh, database
	 * backup) run without it, so a long build never blocks them.
	 */
	const guarded = BUILD_KINDS.has(req.kind);
	const lockFd = guarded
		? openSync(/*turbopackIgnore: true*/ path.join(root, "web", ".job.lock"), "a")
		: null;
	const wrapper = guarded
		? 'flock -n 9 || { echo "! build lain sedang memegang lock - dibatalkan"; printf 1 > "$0"; exit 1; }; "$@"; printf %s "$?" > "$0"'
		: '"$@"; printf %s "$?" > "$0"';

	/*
	 * The job must outlive the request, so it is detached and unref'd — which
	 * means the "exit" event cannot be relied on: a server restart during a
	 * multi-hour build would lose it and leave the row stuck at 'running'
	 * forever, blocking every later job.
	 *
	 * So the exit code is recorded on disk by the child itself. The wrapper
	 * takes the command through "$@" and the path through "$0", both as real
	 * argv entries, so nothing is ever interpolated into shell text.
	 */
	const child = spawn(
		/*turbopackIgnore: true*/ "bash",
		["-c", wrapper, exitFile, ...argv],
		{
			cwd: root,
			// fd 9 is the lock the wrapper's `flock -n 9` holds for as long as
			// the job lives; the kernel releases it when the process exits.
			stdio: lockFd
				? ["ignore", fd, fd, "ignore", "ignore", "ignore", "ignore", "ignore", "ignore", lockFd]
				: ["ignore", fd, fd],
			detached: true,
			// planEnv carries the panel's package lists (LG_PKGS_*), which the
			// build reads instead of its built-in ones.
			env: { ...process.env, ...configEnv, ...planEnv },
		},
	);

	await c.query(
		"UPDATE jobs SET log_file = ?, exit_file = ?, pid = ?, pid_start = ? WHERE id = ?",
		[logFile, exitFile, child.pid ?? null, pidStartTime(child.pid ?? null), id],
	);

	/*
	 * Hand both descriptors over to the child.
	 *
	 * The lock matters here: parent and child share one open file description,
	 * and a flock is released only when every descriptor for it is closed. Left
	 * open in the server, the lock would outlive the job and every later build
	 * would be refused - so the server drops its copy and the child keeps the
	 * lock for exactly as long as it runs.
	 */
	closeSync(fd);
	if (lockFd !== null) closeSync(lockFd);

	child.on("error", async () => {
		await db().query(
			"UPDATE jobs SET status = 'failed', exit_code = -1, finished_at = NOW() WHERE id = ?",
			[id],
		);
	});
	child.unref();

	return id;
}

/*
 * Kernel start time of a process (field 22 of /proc/<pid>/stat, in clock
 * ticks since boot), or null where /proc is unavailable.
 *
 * A pid on its own is not an identity: after a container restart pids start
 * again from 1, so a stale job's pid can belong to an unrelated live process
 * and the job would look like it is still running forever. pid + start time
 * cannot be reused that way.
 */
export function pidStartTime(pid: number | null): number | null {
	if (!pid) return null;
	try {
		const stat = readFileSync(/*turbopackIgnore: true*/ `/proc/${pid}/stat`, "utf8");
		// The command name (field 2) is in parentheses and may contain spaces,
		// so count fields from after the last ')'.
		const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
		const start = Number(rest[19]);
		return Number.isFinite(start) ? start : null;
	} catch {
		return null;
	}
}

/** True when this exact process — same pid AND same start time — is alive. */
export function pidAlive(pid: number | null, start: number | null): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
	} catch (e) {
		// EPERM means it exists but belongs to someone else — still alive.
		if ((e as NodeJS.ErrnoException).code !== "EPERM") return false;
	}
	if (start === null) return true;
	const now = pidStartTime(pid);
	return now === null || now === Number(start);
}

/*
 * Settle any row still marked 'running' whose process has gone. Called before
 * anything reads job state, so a restart mid-build can never wedge the panel.
 */
export async function reconcile(): Promise<void> {
	await ensureSchema();
	const c = db();
	const [rows] = await c.query<RowDataPacket[]>(
		"SELECT id, pid, pid_start, exit_file, TIMESTAMPDIFF(SECOND, started_at, NOW()) AS age FROM jobs WHERE status = 'running'",
	);

	for (const r of rows) {
		// startJob inserts the row before it can spawn, and records the pid
		// only afterwards. A request landing in that gap must not read the
		// missing pid as a dead process, so give a fresh row time to fill in.
		if (!r.pid && !r.exit_file && Number(r.age) < 60) continue;

		let code: number | null = null;
		if (r.exit_file) {
			try {
				code = Number((await readFile(/*turbopackIgnore: true*/ r.exit_file as string, "utf8")).trim());
			} catch {
				// Not written yet: the job is either still going or died hard.
			}
		}

		if (code !== null && Number.isFinite(code)) {
			await c.query(
				"UPDATE jobs SET status = ?, exit_code = ?, finished_at = COALESCE(finished_at, NOW()) WHERE id = ?",
				[code === 0 ? "done" : "failed", code, r.id],
			);
			continue;
		}

		if (!pidAlive(r.pid as number | null, r.pid_start as number | null)) {
			// Process gone with no exit code recorded — killed, or the machine
			// went down. Marked 'unknown' rather than guessed either way.
			await c.query(
				"UPDATE jobs SET status = 'unknown', finished_at = COALESCE(finished_at, NOW()) WHERE id = ?",
				[r.id],
			);
		}
	}
}

/*
 * Recent jobs, newest first. `kinds` keeps each page's history to its own
 * work: a batch build belongs under the checklist, not under the
 * single-command form, the same way the terminal panel is scoped.
 */
export async function listJobs(limit = 20, kinds?: readonly string[]): Promise<Job[]> {
	await reconcile();
	const cols = "id, kind, label, status, exit_code, started_at, finished_at";
	if (kinds && kinds.length) {
		const holes = kinds.map(() => "?").join(",");
		const [rows] = await db().query<RowDataPacket[]>(
			`SELECT ${cols} FROM jobs WHERE kind IN (${holes}) ORDER BY id DESC LIMIT ?`,
			[...kinds, limit],
		);
		return rows as Job[];
	}
	const [rows] = await db().query<RowDataPacket[]>(
		`SELECT ${cols} FROM jobs ORDER BY id DESC LIMIT ?`,
		[limit],
	);
	return rows as Job[];
}

export async function getJob(id: number): Promise<Job | null> {
	await reconcile();
	const [rows] = await db().query<RowDataPacket[]>(
		"SELECT id, kind, label, status, exit_code, started_at, finished_at FROM jobs WHERE id = ?",
		[id],
	);
	return rows.length ? (rows[0] as Job) : null;
}

/** Tail of a job log. Capped so a multi-hour build cannot blow up a response. */
export async function readJobLog(id: number, maxBytes = 200_000): Promise<string> {
	await ensureSchema();
	const [rows] = await db().query<RowDataPacket[]>(
		"SELECT log_file FROM jobs WHERE id = ?",
		[id],
	);
	if (!rows.length || !rows[0].log_file) return "";
	const file = rows[0].log_file as string;
	try {
		// Same reasoning as status.ts: job logs live outside the app directory.
		const { size } = await stat(/*turbopackIgnore: true*/ file);
		const buf = await readFile(/*turbopackIgnore: true*/ file);
		return size > maxBytes
			? `… (${size - maxBytes} bytes trimmed)\n` + buf.subarray(size - maxBytes).toString("utf8")
			: buf.toString("utf8");
	} catch {
		return "";
	}
}
