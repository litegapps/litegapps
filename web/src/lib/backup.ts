import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { repoRoot } from "./paths";
import { BACKUP_NAME } from "./targets";

/*
 * State for the database backup page: which backups sit on this VPS, which
 * ones the last listing job found on SourceForge, and which key they need.
 *
 * As everywhere else in the panel, SourceForge is never contacted inside a
 * request - the remote side comes from web/db-backups.json, written by
 * web/db-list.sh.
 */

export type Backup = {
	name: string;
	local: boolean;
	remote: boolean;
	size: number;
	mtime: number | null;
};

export type BackupState = {
	/** first 8 hex of sha256(key), or null when DB_BACKUP_KEY is not set */
	fingerprint: string | null;
	generated: string | null;
	backups: Backup[];
};

function backupDir(): string {
	return path.join(repoRoot(), "web", "db-backups");
}

export function keyFingerprint(): string | null {
	const raw = (process.env.DB_BACKUP_KEY ?? "").trim();
	if (!/^[0-9a-fA-F]{64}$/.test(raw)) return null;
	return createHash("sha256").update(Buffer.from(raw, "hex")).digest("hex").slice(0, 8);
}

export async function readBackups(): Promise<BackupState> {
	const map = new Map<string, Backup>();

	// Local copies, read straight from the directory the backup job writes to.
	try {
		for (const name of await readdir(/*turbopackIgnore: true*/ backupDir())) {
			if (!BACKUP_NAME.test(name)) continue;
			const s = await stat(/*turbopackIgnore: true*/ path.join(backupDir(), name));
			map.set(name, { name, local: true, remote: false, size: s.size, mtime: s.mtimeMs });
		}
	} catch {
		// No backup directory yet.
	}

	// Remote listing from the last db-list job.
	let generated: string | null = null;
	try {
		const file = path.join(repoRoot(), "web", "db-backups.json");
		const json = JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8")) as {
			generated?: string;
			remote?: { name: string; size: number }[];
		};
		generated = json.generated ?? null;
		for (const r of json.remote ?? []) {
			if (!BACKUP_NAME.test(r.name)) continue;
			const cur = map.get(r.name);
			if (cur) cur.remote = true;
			else map.set(r.name, { name: r.name, local: false, remote: true, size: r.size, mtime: null });
		}
	} catch {
		// Listing never ran, or is unreadable.
	}

	const backups = [...map.values()].sort((a, b) => b.name.localeCompare(a.name));
	return { fingerprint: keyFingerprint(), generated, backups };
}
