import { readdir, lstat, stat, rename, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./paths";

/*
 * File manager rooted at the LiteGapps checkout.
 *
 * Every path that reaches the filesystem goes through safePath(): it is
 * resolved against the repo root and rejected unless it stays inside, so a
 * crafted "../.." from a form can never reach the host. A small blocklist
 * keeps secrets and git internals out of reach entirely - the panel's own
 * .env sits in this tree, and the whole point of the ssh mount being
 * read-only is that the key never becomes downloadable.
 */

/** Names that are never listed, read, or touched, at any depth. */
const BLOCKED_NAMES = [".git", ".env", ".ssh", "node_modules"];

export type Entry = {
	name: string;
	rel: string;
	dir: boolean;
	link: boolean;
	size: number;
	mtime: number;
};

export type Detail = {
	rel: string;
	name: string;
	dir: boolean;
	link: boolean;
	size: number;
	mtime: number;
	mode: string;
	uid: number;
	gid: number;
	items?: number; // directory entries
	target?: string; // symlink target
};

export class FileError extends Error {}

/** Normalise a repo-relative path and resolve it, or throw. */
export function safePath(rel: string): { abs: string; rel: string } {
	const clean = (rel ?? "").replace(/^\/+/, "");
	const root = repoRoot();
	const abs = path.resolve(root, clean);
	const norm = path.relative(root, abs);

	if (norm.startsWith("..") || path.isAbsolute(norm)) {
		throw new FileError("path di luar repo");
	}
	for (const part of norm.split(path.sep)) {
		if (BLOCKED_NAMES.includes(part)) throw new FileError(`<${part}> tidak boleh diakses`);
	}
	return { abs, rel: norm };
}

function hidden(name: string): boolean {
	return BLOCKED_NAMES.includes(name);
}

export async function listDir(rel: string): Promise<{ rel: string; entries: Entry[] }> {
	const p = safePath(rel);
	const names = await readdir(/*turbopackIgnore: true*/ p.abs);

	const entries: Entry[] = [];
	for (const name of names) {
		if (hidden(name)) continue;
		const abs = path.join(p.abs, name);
		try {
			const s = await lstat(/*turbopackIgnore: true*/ abs);
			const link = s.isSymbolicLink();
			// A symlink is described by what it points at, but never followed
			// out of the tree: the link itself is what gets renamed or removed.
			const target = link ? await stat(/*turbopackIgnore: true*/ abs).catch(() => null) : s;
			entries.push({
				name,
				rel: p.rel ? `${p.rel}/${name}` : name,
				dir: Boolean(target?.isDirectory()),
				link,
				size: target?.isDirectory() ? 0 : (target?.size ?? 0),
				mtime: s.mtimeMs,
			});
		} catch {
			// Vanished between readdir and lstat - skip it.
		}
	}

	entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
	return { rel: p.rel, entries };
}

/** Recursive size of a directory, capped so a huge tree cannot stall a request. */
async function dirSize(abs: string, budget = { files: 20000 }): Promise<number> {
	let total = 0;
	const stack = [abs];
	while (stack.length) {
		const dir = stack.pop()!;
		let names: string[];
		try {
			names = await readdir(/*turbopackIgnore: true*/ dir);
		} catch {
			continue;
		}
		for (const n of names) {
			if (budget.files-- <= 0) return total;
			const child = path.join(dir, n);
			try {
				const s = await lstat(/*turbopackIgnore: true*/ child);
				if (s.isDirectory()) stack.push(child);
				else total += s.size;
			} catch {
				// skip
			}
		}
	}
	return total;
}

export async function detail(rel: string): Promise<Detail> {
	const p = safePath(rel);
	const s = await lstat(/*turbopackIgnore: true*/ p.abs);
	const link = s.isSymbolicLink();
	const real = link ? await stat(/*turbopackIgnore: true*/ p.abs).catch(() => null) : s;
	const dir = Boolean(real?.isDirectory());

	const d: Detail = {
		rel: p.rel,
		name: path.basename(p.abs) || "/",
		dir,
		link,
		size: dir ? await dirSize(p.abs) : (real?.size ?? 0),
		mtime: s.mtimeMs,
		mode: (s.mode & 0o777).toString(8).padStart(3, "0"),
		uid: s.uid,
		gid: s.gid,
	};
	if (dir) {
		d.items = (await readdir(/*turbopackIgnore: true*/ p.abs).catch(() => [])).filter(
			(n) => !hidden(n),
		).length;
	}
	return d;
}

/** Text preview of a file, or null when it does not look like text. */
export async function preview(rel: string, maxBytes = 120_000): Promise<string | null> {
	const p = safePath(rel);
	const s = await lstat(/*turbopackIgnore: true*/ p.abs);
	if (s.isDirectory()) return null;
	const buf = await readFile(/*turbopackIgnore: true*/ p.abs);
	// Binary sniff: a NUL byte settles it, otherwise too many control bytes in
	// the head mean this is not text (zips, apks, images) and only its details
	// are shown.
	const head = buf.subarray(0, Math.min(buf.length, 8000));
	if (head.includes(0)) return null;
	let odd = 0;
	for (const byte of head) {
		if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) odd++;
	}
	if (head.length && odd / head.length > 0.1) return null;
	const text = buf.subarray(0, maxBytes).toString("utf8");
	return buf.length > maxBytes ? `${text}\n… (${buf.length - maxBytes} byte lagi tidak ditampilkan)` : text;
}

function checkName(name: string): string {
	const n = name.trim();
	if (!n) throw new FileError("nama kosong");
	if (n === "." || n === "..") throw new FileError("nama tidak valid");
	if (n.includes("/") || n.includes("\\")) throw new FileError("nama tidak boleh berisi /");
	if (hidden(n)) throw new FileError(`nama <${n}> tidak boleh dipakai`);
	if (n.length > 200) throw new FileError("nama terlalu panjang");
	return n;
}

export async function removeEntry(rel: string): Promise<void> {
	const p = safePath(rel);
	if (!p.rel) throw new FileError("root repo tidak bisa dihapus");
	await rm(/*turbopackIgnore: true*/ p.abs, { recursive: true, force: false });
}

export async function renameEntry(rel: string, name: string): Promise<string> {
	const p = safePath(rel);
	if (!p.rel) throw new FileError("root repo tidak bisa diganti nama");
	const n = checkName(name);
	const dest = safePath(path.join(path.dirname(p.rel), n));
	if (await exists(dest.abs)) throw new FileError(`<${n}> sudah ada`);
	await rename(/*turbopackIgnore: true*/ p.abs, dest.abs);
	return dest.rel;
}

export async function moveEntry(rel: string, destDir: string): Promise<string> {
	const p = safePath(rel);
	if (!p.rel) throw new FileError("root repo tidak bisa dipindah");
	const d = safePath(destDir);
	const ds = await lstat(/*turbopackIgnore: true*/ d.abs).catch(() => null);
	if (!ds?.isDirectory()) throw new FileError(`<${d.rel || "/"}> bukan folder`);
	// Moving a directory into itself would detach the whole subtree.
	if (d.rel === p.rel || d.rel.startsWith(`${p.rel}/`)) {
		throw new FileError("tidak bisa memindah folder ke dalam dirinya sendiri");
	}
	const dest = safePath(path.join(d.rel, path.basename(p.rel)));
	if (dest.rel === p.rel) throw new FileError("sudah berada di folder itu");
	if (await exists(dest.abs)) throw new FileError(`<${path.basename(dest.rel)}> sudah ada di tujuan`);
	await rename(/*turbopackIgnore: true*/ p.abs, dest.abs);
	return dest.rel;
}

async function exists(abs: string): Promise<boolean> {
	try {
		await lstat(/*turbopackIgnore: true*/ abs);
		return true;
	} catch {
		return false;
	}
}
