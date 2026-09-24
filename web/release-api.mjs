#!/usr/bin/env node
/*
 * web/release-api.mjs
 *
 * Turns an `rsync -r --list-only` listing of <FRS>/litegapps/ (read from
 * stdin) into the public release index: the newest release of every variant
 * per target, with its download link, md5 and upload time.
 *
 *   web/api/litegapps/<arch>/<sdk>.json   one file per target
 *   web/api/litegapps/index.json          every target, for an overview
 *
 * served by the panel at /api/litegapps/... without a login. Run it through
 * web/make-release-api.sh, which does the SourceForge listing.
 *
 * usage: node web/release-api.mjs <base>   ("" or "<arch>/<sdk>", see api-common)
 *
 * Releases live in <arch>/<sdk>/<variant>/<YYYY-MM-DD>/ and the newest dated
 * folder of a variant is its release. Most hold one zip; releases from 2024
 * hold three flavours (AUTO-, MAKSU-, RECOVERY-), so every variant lists all
 * zips of its folder in "files" and repeats the first one at the top level.
 * A variant without any dated folder (Android 7.0-8.0 only have zips straight
 * in the variant folder, e.g. ..._v2.5_official.zip) gets its newest zip,
 * marked "legacy". Folders that are not a build variant (playintegrity) are
 * left out.
 *
 * md5 follows the same rule as addon-api.mjs: only from provably the same
 * file (previous index, or output/ with the same size and time), else from
 * SourceForge's RSS feed, else empty.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import {
	ANDROID, ARCHS, PROJECT, SCHEMA, WEB, REPO,
	baseArg, iso, localMd5, parseListing, readJson, readStdin, rss, writeAtomic,
} from "./api-common.mjs";

const OUT = path.join(WEB, "api", "litegapps");
// Keep in step with VARIANTS in web/src/lib/targets.ts.
const VARIANTS = ["lite", "core", "go", "micro", "pixel", "nano", "basic", "user", "superlite"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const FLAVOURS = ["", "AUTO", "MAGISK", "MAKSU", "RECOVERY"];

const base = baseArg();

/* ── Listing ────────────────────────────────────────────────────────────── */

/** "<arch>/<sdk>" -> variant -> [{ path, dir, file, size, updated }] */
const targets = new Map();

for (const f of parseListing(await readStdin(), base)) {
	if (!f.path.endsWith(".zip")) continue;
	const parts = f.path.split("/"); // arch sdk variant [folder] file
	if (parts.length !== 4 && parts.length !== 5) continue;
	const [arch, sdk, variant] = parts;
	if (!ARCHS.includes(arch) || !/^\d+$/.test(sdk) || !VARIANTS.includes(variant)) continue;
	const key = `${arch}/${sdk}`;
	if (!targets.has(key)) targets.set(key, new Map());
	const byVariant = targets.get(key);
	if (!byVariant.has(variant)) byVariant.set(variant, []);
	byVariant.get(variant).push({
		path: f.path,
		dir: parts.length === 5 ? parts[3] : "",
		file: parts[parts.length - 1],
		size: f.size,
		updated: f.updated,
	});
}

if (base && !targets.has(base)) targets.set(base, new Map());

/** AUTO-LiteGapps-... and the older [AUTO]LiteGapps_... -> "AUTO"; plain LiteGapps-... -> "" */
const flavourOf = (file) => {
	const m = file.match(/^(?:([A-Z]+)-|\[([A-Z]+)\])LiteGapps/);
	const f = m ? m[1] ?? m[2] : "";
	return FLAVOURS.includes(f) ? f : "";
};
/** "_v2.5_" in the names from before dated folders, or "" */
const versionOf = (file) => file.match(/_v(\d+(?:\.\d+)*)_/)?.[1] ?? "";

/** The zips of a variant's newest release, and how it was picked. */
function newestRelease(zips) {
	const dated = zips.filter((z) => ISO_DAY.test(z.dir));
	let pick;
	let legacy = false;
	if (dated.length) {
		const day = dated.reduce((m, z) => (z.dir > m ? z.dir : m), "");
		pick = dated.filter((z) => z.dir === day);
	} else {
		// No dated folder: the newest zip, and the other flavours of that same
		// release - same folder and same version (or same day, without one).
		const top = zips.reduce((m, z) => (!m || z.updated > m.updated ? z : m), null);
		const v = versionOf(top.file);
		pick = zips.filter(
			(z) =>
				z.dir === top.dir &&
				(v ? versionOf(z.file) === v : z.updated.slice(0, 10) === top.updated.slice(0, 10)),
		);
		legacy = true;
	}
	pick.sort(
		(a, b) => FLAVOURS.indexOf(flavourOf(a.file)) - FLAVOURS.indexOf(flavourOf(b.file)) || a.file.localeCompare(b.file),
	);
	return { pick, legacy };
}

/* ── Write ──────────────────────────────────────────────────────────────── */

const now = iso(Date.now());
let written = 0;
let kept = 0;

for (const [key, byVariant] of [...targets].sort()) {
	const [arch, sdk] = key.split("/");
	const file = path.join(OUT, arch, `${sdk}.json`);
	const prev = await readJson(file);
	const prevFiles = new Map(
		Object.values(prev?.variants ?? {}).flatMap((v) => (v.files ?? []).map((f) => [f.url, f])),
	);

	// An empty or failed listing must never wipe an index the app relies on.
	if (!byVariant.size) {
		if (prevFiles.size) {
			console.log(`! ${key}: no release found on SourceForge - keeping the existing index`);
			kept++;
		} else {
			console.log(`- ${key}: no release on SourceForge`);
		}
		continue;
	}

	const variants = {};
	for (const variant of VARIANTS) {
		const zips = byVariant.get(variant);
		if (!zips?.length) continue;
		const { pick, legacy } = newestRelease(zips);
		const files = pick.map((z) => ({
			file: z.file,
			flavour: flavourOf(z.file).toLowerCase(),
			// Segments encoded: the oldest names carry [AUTO]-style brackets.
			url: `https://sourceforge.net/projects/${PROJECT}/files/litegapps/${z.path.split("/").map(encodeURIComponent).join("/")}/download`,
			size: z.size,
			md5: "",
			updated: z.updated,
		}));

		// 1. previous index, same file   2. output/ from this VPS   3. RSS
		for (const f of files) {
			const p = prevFiles.get(f.url);
			if (p && p.md5 && p.size === f.size && p.updated === f.updated) f.md5 = p.md5;
		}
		for (const [i, f] of files.entries()) {
			if (f.md5) continue;
			const local = path.join(REPO, "output", "litegapps", pick[i].path);
			f.md5 = await localMd5(local, f.size, f.updated);
		}
		if (files.some((f) => !f.md5)) {
			const feed = await rss(`/litegapps/${arch}/${sdk}/${variant}`);
			for (const [i, f] of files.entries()) {
				if (f.md5) continue;
				const hit = feed.get(`/litegapps/${pick[i].path}`);
				if (hit && (!hit.size || hit.size === f.size)) f.md5 = hit.md5;
			}
		}

		const first = files[0];
		variants[variant] = {
			variant,
			// the release folder's date, or the upload day for a legacy zip
			date: legacy ? first.updated.slice(0, 10) : pick[0].dir,
			legacy,
			...(legacy && versionOf(first.file) ? { version: versionOf(first.file) } : {}),
			file: first.file,
			url: first.url,
			size: first.size,
			md5: first.md5,
			updated: files.reduce((m, f) => (f.updated > m ? f.updated : m), ""),
			files,
		};
	}

	const list = Object.values(variants);
	const noMd5 = list.flatMap((v) => v.files).filter((f) => !f.md5).length;
	const doc = {
		schema: SCHEMA,
		arch,
		sdk: Number(sdk),
		android: ANDROID[sdk] ?? "",
		updated: list.reduce((m, v) => (v.updated > m ? v.updated : m), ""),
		generated: now,
		count: list.length,
		variants,
	};
	await writeAtomic(file, JSON.stringify(doc) + "\n");
	written++;
	console.log(
		`- ${key}: ${list.map((v) => `${v.variant} ${v.date}${v.legacy ? " (legacy)" : ""}`).join(", ")}` +
			(noMd5 ? ` (${noMd5} without md5)` : ""),
	);
}

/* ── index.json: every target that has an index ─────────────────────────── */

const index = [];
for (const arch of ARCHS) {
	let names = [];
	try {
		names = await readdir(path.join(OUT, arch));
	} catch {
		continue;
	}
	for (const name of names) {
		const m = name.match(/^(\d+)\.json$/);
		if (!m) continue;
		const doc = await readJson(path.join(OUT, arch, name));
		if (!doc?.variants) continue;
		const list = Object.values(doc.variants);
		index.push({
			arch,
			sdk: Number(m[1]),
			android: doc.android ?? ANDROID[m[1]] ?? "",
			updated: doc.updated ?? "",
			generated: doc.generated ?? "",
			variants: Object.fromEntries(list.map((v) => [v.variant, v.date])),
			path: `litegapps/${arch}/${m[1]}.json`,
		});
	}
}
index.sort((a, b) => ARCHS.indexOf(a.arch) - ARCHS.indexOf(b.arch) || b.sdk - a.sdk);
await writeAtomic(
	path.join(OUT, "index.json"),
	JSON.stringify({ schema: SCHEMA, generated: now, targets: index }) + "\n",
);

console.log(`- Wrote ${written} target index(es)${kept ? `, kept ${kept}` : ""}, ${index.length} in index.json`);
