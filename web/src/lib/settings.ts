import type { RowDataPacket } from "mysql2";
import { db, ensureSchema } from "./db";

/*
 * Small key/value settings, for the handful of switches the panel keeps
 * (the daily backup, release retention). They live in MySQL rather than .env so the
 * toggle takes effect without a redeploy.
 */

export const AUTO_BACKUP = "backup.auto";
/** Date (YYYY-MM-DD, server time) of the last automatic backup that was started. */
export const AUTO_BACKUP_LAST = "backup.auto.last";
/** Hour of day the automatic backup runs. */
export const AUTO_BACKUP_HOUR = 3;

/** "1"/"0": keep only the newest releases per variant on SourceForge (default on). */
export const RELEASE_PRUNE = "release.prune";
/** How many dated releases per variant survive the prune. */
export const RELEASE_KEEP = "release.keep";
export const RELEASE_KEEP_DEFAULT = 15;
export const RELEASE_KEEP_MAX = 100;

export async function getSetting(key: string): Promise<string | null> {
	await ensureSchema();
	const [rows] = await db().query<RowDataPacket[]>("SELECT v FROM settings WHERE k = ?", [key]);
	return rows.length ? String(rows[0].v) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
	await ensureSchema();
	await db().query(
		"INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
		[key, value],
	);
}

export async function autoBackupOn(): Promise<boolean> {
	return (await getSetting(AUTO_BACKUP)) === "1";
}

/** Google Drive source mirror: rclone remote name and the folder inside it. */
export const MIRROR_REMOTE = "mirror.remote";
export const MIRROR_DIR = "mirror.dir";
export const MIRROR_REMOTE_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const MIRROR_DIR_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]{1,120}$/;

export async function readMirror(): Promise<{ remote: string; dir: string }> {
	const [r, d] = await Promise.all([getSetting(MIRROR_REMOTE), getSetting(MIRROR_DIR)]);
	return {
		remote: r && MIRROR_REMOTE_RE.test(r) ? r : "gdrive",
		dir: d && MIRROR_DIR_RE.test(d) ? d : "litegapps-mirror",
	};
}

/** Where restores download sources from: "sf" (SourceForge) or "drive" (mirror first). */
export const SOURCE_PREFER = "source.prefer";

export async function readSource(): Promise<{ prefer: "sf" | "drive"; remote: string; dir: string }> {
	const [p, m] = await Promise.all([getSetting(SOURCE_PREFER), readMirror()]);
	return { prefer: p === "drive" ? "drive" : "sf", ...m };
}

/** Release retention as the build jobs get it (web/sf-prune.sh). */
export async function readRetention(): Promise<{ on: boolean; keep: number }> {
	const [on, keep] = await Promise.all([getSetting(RELEASE_PRUNE), getSetting(RELEASE_KEEP)]);
	const n = Number(keep);
	return {
		on: on !== "0",
		keep: Number.isInteger(n) && n >= 1 && n <= RELEASE_KEEP_MAX ? n : RELEASE_KEEP_DEFAULT,
	};
}

/** Local date as YYYY-MM-DD, the granularity "once a day" is measured in. */
export function today(d = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
