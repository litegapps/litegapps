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

/*
 * Monthly auto build (switch on Build > Multi): whatever Multi has ticked,
 * started by src/lib/scheduler.ts on the given day and hour of each month
 * (server time; start.sh gives the container the host's time zone).
 */
export const AUTOBUILD_ON = "autobuild.on";
export const AUTOBUILD_DAY = "autobuild.day";
export const AUTOBUILD_HOUR = "autobuild.hour";
/** YYYY-MM of the last month an auto build was started. */
export const AUTOBUILD_LAST = "autobuild.last";

export type AutoBuild = { on: boolean; day: number; hour: number; last: string };

export async function readAutoBuild(): Promise<AutoBuild> {
	const [on, day, hour, last] = await Promise.all(
		[AUTOBUILD_ON, AUTOBUILD_DAY, AUTOBUILD_HOUR, AUTOBUILD_LAST].map(getSetting),
	);
	const d = Number(day);
	const h = Number(hour);
	return {
		on: on === "1",
		day: Number.isInteger(d) && d >= 1 && d <= 28 ? d : 1,
		hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 0,
		last: last ?? "",
	};
}

/** YYYY-MM of a date in server time. */
export function month(d = new Date()): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

/*
 * File API auto refresh: the scheduler reruns web/make-addon-api.sh and
 * web/make-release-api.sh for every target once their last full run is
 * ADDONAPI_DAYS old (default 4 days), so the JSON and the README lists on
 * SourceForge catch uploads made outside a panel batch build.
 */
export const ADDONAPI_ON = "addonapi.auto";
export const ADDONAPI_DAYS = "addonapi.days";
/** ISO time the last full run was started (by the scheduler or the page). */
export const ADDONAPI_LAST = "addonapi.last";
/** Same for the release index (web/make-release-api.sh), on the same switch and interval. */
export const RELEASEAPI_LAST = "releaseapi.last";
export const ADDONAPI_DAYS_DEFAULT = 4;
export const ADDONAPI_DAYS_MAX = 30;

export type AddonApiAuto = { on: boolean; days: number; last: string; releaseLast: string };

export async function readAddonApiAuto(): Promise<AddonApiAuto> {
	const [on, days, last, releaseLast] = await Promise.all([
		getSetting(ADDONAPI_ON),
		getSetting(ADDONAPI_DAYS),
		getSetting(ADDONAPI_LAST),
		getSetting(RELEASEAPI_LAST),
	]);
	const n = Number(days);
	return {
		// On unless switched off: the app relies on the list staying current.
		on: on !== "0",
		days: Number.isInteger(n) && n >= 1 && n <= ADDONAPI_DAYS_MAX ? n : ADDONAPI_DAYS_DEFAULT,
		last: last ?? "",
		releaseLast: releaseLast ?? "",
	};
}
