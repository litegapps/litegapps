import { spawn } from "node:child_process";
import { openSync, mkdirSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db, ensureSchema } from "./db";
import { repoRoot, jobLogDir } from "./paths";
import { ARCHS, SDKS, VARIANTS } from "./targets";
import type { Job, JobRequest } from "./targets";

export { ARCHS, SDKS, VARIANTS } from "./targets";
export type { Job, JobKind, JobRequest } from "./targets";

/*
 * Job runner.
 *
 * The panel never reimplements build or upload logic: it shells out to the
 * scripts that already own it (build.sh, packages/make, web/make-status.sh).
 * Commands are built from a fixed allowlist and passed to spawn() as an argv
 * array with no shell, so nothing a form can submit is ever interpreted.
 */

type Plan = { argv: string[]; label: string };

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
	const needVariant = () => {
		if (!(VARIANTS as readonly string[]).includes(variant)) {
			throw new Error(`bad variant: ${variant}`);
		}
	};

	switch (req.kind) {
		case "make":
			needVariant(); needArch(); needSdk();
			return {
				argv: ["bash", "build.sh", "make", "litegapps", variant, arch, sdk],
				label: `make ${variant} ${arch} sdk ${sdk}`,
			};
		case "packages":
			needArch(); needSdk();
			return {
				argv: ["bash", "packages/make", "make", arch, sdk],
				label: `packages ${arch} sdk ${sdk}`,
			};
		case "restore":
			return { argv: ["sh", "build.sh", "restore"], label: "restore" };
		case "clean":
			return { argv: ["sh", "build.sh", "clean"], label: "clean" };
		case "status":
			return { argv: ["bash", "web/make-status.sh"], label: "refresh status.json" };
		default:
			throw new Error(`unknown job kind: ${req.kind}`);
	}
}

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

	if (await runningJob()) throw new Error("a job is already running");

	const { argv, label } = plan(req);
	const root = repoRoot();
	const dir = jobLogDir();
	mkdirSync(dir, { recursive: true });

	const c = db();
	const [res] = await c.query<ResultSetHeader>(
		"INSERT INTO jobs (kind, label, argv, log_file) VALUES (?, ?, ?, '')",
		[req.kind, label, argv.join(" ")],
	);
	const id = res.insertId;
	const logFile = path.join(dir, `${id}.log`);
	const exitFile = path.join(dir, `${id}.exit`);

	const fd = openSync(/*turbopackIgnore: true*/ logFile, "a");

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
		["-c", '"$@"; printf %s "$?" > "$0"', exitFile, ...argv],
		{
			cwd: root,
			stdio: ["ignore", fd, fd],
			detached: true,
			env: process.env,
		},
	);

	await c.query(
		"UPDATE jobs SET log_file = ?, exit_file = ?, pid = ?, pid_start = ? WHERE id = ?",
		[logFile, exitFile, child.pid ?? null, pidStartTime(child.pid ?? null), id],
	);

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
		"SELECT id, pid, pid_start, exit_file FROM jobs WHERE status = 'running'",
	);

	for (const r of rows) {
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

export async function listJobs(limit = 20): Promise<Job[]> {
	await reconcile();
	const [rows] = await db().query<RowDataPacket[]>(
		"SELECT id, kind, label, status, exit_code, started_at, finished_at FROM jobs ORDER BY id DESC LIMIT ?",
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
