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
