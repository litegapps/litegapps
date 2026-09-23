import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "./paths";

/*
 * State of the Google Drive source mirror for the Mirror page. Nothing here
 * talks to Drive or SourceForge: the page must not stall on the network, so
 * it reads what web/gdrive-mirror.sh last wrote, plus local facts about the
 * rclone install.
 */

export type MirrorStatus = {
	generated: string;
	mode: "check" | "sync";
	ok: boolean;
	remote: string;
	dir: string;
	folders: { name: string; files: number; bytes: number }[];
};

export async function readMirrorStatus(): Promise<MirrorStatus | null> {
	try {
		const raw = await readFile(
			/*turbopackIgnore: true*/ path.join(repoRoot(), "web", "mirror-status.json"),
			"utf8",
		);
		return JSON.parse(raw) as MirrorStatus;
	} catch {
		return null;
	}
}

/** The rclone config the jobs use, as docker-entrypoint.sh installs it. */
function configPath(): string {
	return process.env.RCLONE_CONFIG || path.join(os.homedir(), ".config", "rclone", "rclone.conf");
}

/**
 * Whether rclone is installed and which remotes its config defines. Only the
 * section names and their `type` are read - never the token lines.
 */
export async function rcloneSetup(): Promise<{
	installed: boolean;
	config: boolean;
	remotes: { name: string; type: string }[];
}> {
	const installed = existsSync("/usr/local/bin/rclone") || existsSync("/usr/bin/rclone");
	let text = "";
	try {
		text = await readFile(/*turbopackIgnore: true*/ configPath(), "utf8");
	} catch {
		return { installed, config: false, remotes: [] };
	}
	const remotes: { name: string; type: string }[] = [];
	let current: { name: string; type: string } | null = null;
	for (const line of text.split("\n")) {
		const sec = line.match(/^\s*\[([^\]]+)\]\s*$/);
		if (sec) {
			current = { name: sec[1], type: "?" };
			remotes.push(current);
			continue;
		}
		const t = line.match(/^\s*type\s*=\s*(\S+)/);
		if (t && current) current.type = t[1];
	}
	return { installed, config: true, remotes };
}

/* ── Per-file view ─────────────────────────────────────────────────────── */

type LsEntry = { Path: string; Size: number; ModTime: string; Metadata?: { btime?: string } };

export type MirrorFileState = "same" | "differ" | "missing" | "drive-only";

export type MirrorFile = {
	/** relative to files-server/, e.g. litegapps/arm64/36/36.zip */
	path: string;
	sf?: { size: number; mod: string };
	/** mod is the SourceForge mtime rclone carries over; copied is when the mirror last wrote it */
	drive?: { size: number; mod: string; copied?: string };
	state: MirrorFileState;
};

/**
 * Every source file on SourceForge and on the Drive mirror, side by side, as
 * web/gdrive-mirror.sh last listed them. "same" means same size and the same
 * modification time to within two seconds (rclone copies the source's mtime;
 * SFTP only has whole seconds) - the same test rclone uses to skip a file.
 */
export async function readMirrorFiles(): Promise<{ generated: string; files: MirrorFile[] } | null> {
	let data: { generated: string; sourceforge: LsEntry[]; drive: LsEntry[] };
	try {
		data = JSON.parse(
			await readFile(
				/*turbopackIgnore: true*/ path.join(repoRoot(), "web", "mirror-files.json"),
				"utf8",
			),
		);
	} catch {
		return null;
	}

	// Last copy per path, from web/mirror-copied.tsv (appended by the script).
	const copied = new Map<string, string>();
	try {
		const tsv = await readFile(
			/*turbopackIgnore: true*/ path.join(repoRoot(), "web", "mirror-copied.tsv"),
			"utf8",
		);
		for (const line of tsv.split("\n")) {
			const [p, t] = line.split("\t");
			if (p && t && (!copied.has(p) || t > copied.get(p)!)) copied.set(p, t);
		}
	} catch {
		// no copies recorded yet
	}

	const byPath = new Map<string, MirrorFile>();
	for (const e of data.sourceforge ?? []) {
		byPath.set(e.Path, { path: e.Path, sf: { size: e.Size, mod: e.ModTime }, state: "missing" });
	}
	for (const e of data.drive ?? []) {
		const f = byPath.get(e.Path) ?? { path: e.Path, state: "drive-only" as MirrorFileState };
		// Drive's own creation time is the fallback for files copied before
		// the script started keeping a record.
		f.drive = { size: e.Size, mod: e.ModTime, copied: copied.get(e.Path) ?? e.Metadata?.btime };
		byPath.set(e.Path, f);
	}
	for (const f of byPath.values()) {
		if (f.sf && f.drive) {
			const dt = Math.abs(Date.parse(f.sf.mod) - Date.parse(f.drive.mod));
			f.state = f.sf.size === f.drive.size && dt < 2000 ? "same" : "differ";
		}
	}
	const files = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));
	return { generated: data.generated, files };
}
