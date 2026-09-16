import type { RowDataPacket } from "mysql2";
import { db, ensureSchema } from "./db";

/*
 * Small key/value settings, for the handful of switches the panel keeps
 * (currently the daily backup). They live in MySQL rather than .env so the
 * toggle takes effect without a redeploy.
 */

export const AUTO_BACKUP = "backup.auto";
/** Date (YYYY-MM-DD, server time) of the last automatic backup that was started. */
export const AUTO_BACKUP_LAST = "backup.auto.last";
/** Hour of day the automatic backup runs. */
export const AUTO_BACKUP_HOUR = 3;

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

/** Local date as YYYY-MM-DD, the granularity "once a day" is measured in. */
export function today(d = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
