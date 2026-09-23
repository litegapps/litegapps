/*
 * Live progress of a mirror job, read from the stats blocks rclone prints
 * every 5 s into the job log (web/gdrive-mirror.sh passes --stats 5s
 * --stats-file-name-length 0). Only the latest block matters:
 *
 *   Transferred:   	   17.996 MiB / 122.167 MiB, 15%, 3.749 MiB/s, ETA 27s
 *   Transferred:            0 / 1, 0%
 *   Elapsed time:         7.9s
 *   Transferring:
 *    * litegapps/arm64/36/36.zip: 14% /122.167Mi, 3.749Mi/s, 27s
 *
 * plus the "INFO  : <path>: Copied (new)" line rclone prints as each file
 * finishes. Every byte is read from SourceForge and written to Drive in the
 * same stream, so one speed covers both the download and the upload.
 */

export type MirrorTransfer = { path: string; pct: number; size: string; speed: string; eta: string };

export type MirrorProgress = {
	bytes: { done: string; total: string; pct: number; speed: string; eta: string } | null;
	files: { done: number; total: number } | null;
	elapsed: string;
	transferring: MirrorTransfer[];
	/** files finished so far, newest last */
	copied: string[];
	errors: number;
	/** the script printed its closing line */
	finished: boolean;
};

const BYTES = /Transferred:\s+([\d.]+ \S+) \/ ([\d.]+ \S+), (\d+)%, ([\d.]+ \S+\/s), ETA (\S+)/;
const FILES = /Transferred:\s+(\d+) \/ (\d+), \d+%/;
const ELAPSED = /Elapsed time:\s+(\S+)/;
const ITEM = /^\s*\* (.+): (\d+)% \/([\d.]+\S*), ([\d.]+\S*\/s), (\S+)\s*$/;
const COPIED = /INFO {2}: (.+): Copied \(/;

export function parseMirrorLog(log: string): MirrorProgress {
	const lines = log.split("\n");
	const out: MirrorProgress = {
		bytes: null,
		files: null,
		elapsed: "",
		transferring: [],
		copied: [],
		errors: 0,
		finished: /- Mirror \S+ done|! rclone exited/.test(log),
	};

	// The latest block starts at the last "Transferred: <bytes>" line.
	let start = -1;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (BYTES.test(lines[i])) {
			start = i;
			break;
		}
	}
	for (const line of lines) {
		const c = line.match(COPIED);
		if (c) out.copied.push(c[1]);
		if (/ERROR :/.test(line)) out.errors++;
	}
	if (start < 0) return out;

	const b = lines[start].match(BYTES)!;
	out.bytes = { done: b[1], total: b[2], pct: Number(b[3]), speed: b[4], eta: b[5] };
	let inList = false;
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i];
		if (/INFO {2}:\s*$/.test(line) || BYTES.test(line)) break;
		const f = line.match(FILES);
		if (f) out.files = { done: Number(f[1]), total: Number(f[2]) };
		const e = line.match(ELAPSED);
		if (e) out.elapsed = e[1];
		if (/Transferring:/.test(line)) {
			inList = true;
			continue;
		}
		const it = inList ? line.match(ITEM) : null;
		if (it) out.transferring.push({ path: it[1], pct: Number(it[2]), size: it[3], speed: it[4], eta: it[5] });
	}
	// Once the job has ended nothing is in flight any more.
	if (out.finished) out.transferring = [];
	return out;
}
