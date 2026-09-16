import { readdir, readFile } from "node:fs/promises";

/*
 * Build processes running in this container that the panel did not start.
 *
 * The single-job lock lives in the database, but a build started outside the
 * panel - a `docker exec` into this container, or a job whose row was lost -
 * would not be in there, and two builds share output/, log/ and the gapps
 * tree. So before starting anything that touches the build tree, the panel
 * looks for one that is already running.
 *
 * Note this only sees this container's namespace: a build run on the host
 * itself is invisible here, which is one more reason to drive builds from the
 * panel.
 */

const BUILD_CMDS = [
	"build.sh",
	"packages/make",
	"web/build-batch.sh",
	"web/clean-sources.sh",
	"vps-build.sh",
	"sf-build.sh",
];

export type ForeignProc = { pid: number; cmd: string };

export async function findBuildProcesses(ignorePids: number[] = []): Promise<ForeignProc[]> {
	let entries: string[];
	try {
		entries = await readdir(/*turbopackIgnore: true*/ "/proc");
	} catch {
		return [];
	}

	const out: ForeignProc[] = [];
	for (const e of entries) {
		const pid = Number(e);
		if (!Number.isInteger(pid) || pid < 1) continue;
		if (pid === process.pid || ignorePids.includes(pid)) continue;
		let cmd: string;
		try {
			cmd = (await readFile(/*turbopackIgnore: true*/ `/proc/${pid}/cmdline`, "utf8"))
				.replace(/\0/g, " ")
				.trim();
		} catch {
			continue; // gone, or not ours to read
		}
		if (!cmd) continue;
		// The runner's own wrapper carries the command in its argv too; it is
		// matched here on purpose, since it means a job really is running.
		if (BUILD_CMDS.some((c) => cmd.includes(c))) out.push({ pid, cmd: cmd.slice(0, 120) });
	}
	return out;
}
