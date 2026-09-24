/*
 * web/api-common.mjs
 *
 * Shared by the public API generators (addon-api.mjs, release-api.mjs):
 * reading an `rsync -r --list-only` listing, md5 from the local file or
 * SourceForge's RSS feed, and atomic writes into web/api/.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WEB = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.dirname(WEB);
export const PROJECT = "litegapps";
export const ARCHS = ["arm64", "arm", "x86", "x86_64"];
export const SCHEMA = 1;
// Keep in step with SDK_MAP in web/make-status.sh / get_android_version() in build.sh.
export const ANDROID = {
	21: "5.0", 22: "5.1", 23: "6.0", 24: "7.0", 25: "7.1", 26: "8.0", 27: "8.1",
	28: "9", 29: "10", 30: "11", 31: "12", 32: "12.1", 33: "13", 34: "14",
	35: "15", 36: "16", 37: "17",
};

/** argv[2]: "" for the whole tree, or "<arch>/<sdk>" when only that target was listed. */
export function baseArg() {
	const base = (process.argv[2] ?? "").replace(/^\/+|\/+$/g, "");
	if (base && !/^(arm64|arm|x86|x86_64)\/\d+$/.test(base)) {
		console.log(`! bad base <${base}>`);
		process.exit(1);
	}
	return base;
}

export const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

export function readStdin() {
	return new Promise((resolve) => {
		let s = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (d) => (s += d));
		process.stdin.on("end", () => resolve(s));
	});
}

// <perms> <size with commas> <YYYY/MM/DD> <HH:MM:SS> <path>; the caller runs
// rsync with TZ=UTC, so the time is UTC.
const LINE = /^-\S+\s+([\d,]+)\s+(\d{4})\/(\d\d)\/(\d\d)\s+(\d\d:\d\d:\d\d)\s+(.+)$/;

/** Regular files of a listing: { path (prefixed with base), size, updated (ISO UTC) }. */
export function parseListing(text, base) {
	const out = [];
	for (const line of text.split("\n")) {
		const m = line.match(LINE);
		if (!m) continue;
		out.push({
			path: base ? `${base}/${m[6]}` : m[6],
			size: Number(m[1].replace(/,/g, "")),
			updated: iso(Date.parse(`${m[2]}-${m[3]}-${m[4]}T${m[5]}Z`)),
		});
	}
	return out;
}

export async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch {
		return null;
	}
}

function md5File(file) {
	return new Promise((resolve, reject) => {
		const h = createHash("md5");
		createReadStream(file)
			.on("data", (d) => h.update(d))
			.on("end", () => resolve(h.digest("hex")))
			.on("error", reject);
	});
}

/**
 * md5 of a local copy, but only when it is the file on SourceForge: rsync -a
 * keeps the mtime, so an uploaded file has the same size and time.
 */
export async function localMd5(file, size, updated) {
	try {
		const st = await stat(file);
		if (st.size !== size || Math.abs(st.mtimeMs - Date.parse(updated)) > 2000) return "";
		return await md5File(file);
	} catch {
		return "";
	}
}

/** SourceForge RSS feed of one folder: path as the feed titles it (/addon/...) -> { size, md5 }. */
export async function rss(dir) {
	const url = `https://sourceforge.net/projects/${PROJECT}/rss?path=${encodeURIComponent(dir)}`;
	const out = new Map();
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "litegapps-panel-api" },
			signal: AbortSignal.timeout(60_000),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const xml = await res.text();
		for (const item of xml.split("<item>").slice(1)) {
			const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1]?.trim();
			const size = item.match(/filesize="(\d+)"/)?.[1];
			const md5 = item.match(/<media:hash[^>]*algo="md5"[^>]*>([0-9a-f]{32})</i)?.[1];
			if (title && md5) out.set(title, { size: Number(size ?? 0), md5: md5.toLowerCase() });
		}
	} catch (err) {
		console.log(`! RSS feed ${dir} unavailable (${err.message}) - those md5 stay empty`);
	}
	return out;
}

export async function writeAtomic(file, text) {
	await mkdir(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp-${process.pid}`;
	await writeFile(tmp, text);
	// rename() is atomic, so the public route never serves a half-written file.
	await rename(tmp, file);
}

/** Rewrite only when the text changed, so rsync skips unchanged files. */
export async function writeIfChanged(file, text) {
	try {
		if ((await readFile(file, "utf8")) === text) return false;
	} catch {
		// not written yet
	}
	await writeAtomic(file, text);
	return true;
}

export const bytes = (n) => {
	if (!n) return "0 B";
	const u = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
	return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};
