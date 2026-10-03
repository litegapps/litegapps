import { readFileSync } from "node:fs";
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
	/** first 8 hex of sha256(key) new backups are sealed with, or null without a key */
	fingerprint: string | null;
	/** where that key comes from: the SourceForge ssh key, or DB_BACKUP_KEY */
	keySource: "ssh" | "env" | null;
	generated: string | null;
	backups: Backup[];
};

function backupDir(): string {
	return path.join(repoRoot(), "web", "db-backups");
}

/*
 * Same choice as key() in web/db-tool.mjs: the key derived from the ssh key
 * (so a new VPS with the same ssh key opens every backup), DB_BACKUP_KEY only
 * when there is no ssh key. Keep the two in step.
 */
function sealKey(): { key: Buffer; source: "ssh" | "env" } | null {
	try {
		const ssh = readFileSync(
			/*turbopackIgnore: true*/ path.join(process.env.HOME ?? "", ".ssh", "id_rsa"),
		);
		return {
			key: createHash("sha256").update("litegapps-db-backup\n").update(ssh).digest(),
			source: "ssh",
		};
	} catch {
		// no ssh key imported
	}
	const raw = (process.env.DB_BACKUP_KEY ?? "").trim();
	if (/^[0-9a-fA-F]{64}$/.test(raw)) return { key: Buffer.from(raw, "hex"), source: "env" };
	return null;
}

export function keyFingerprint(): string | null {
	const k = sealKey();
	return k ? createHash("sha256").update(k.key).digest("hex").slice(0, 8) : null;
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
	return { fingerprint: keyFingerprint(), keySource: sealKey()?.source ?? null, generated, backups };
}
