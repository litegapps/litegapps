#!/usr/bin/env node
/*
 * web/addon-api.mjs
 *
 * Turns an `rsync -r --list-only` listing of <FRS>/addon/ (read from stdin)
 * into the public addon index the LiteGapps Controller app (lico) downloads:
 *
 *   web/api/addon/<arch>/<sdk>.json    one file per target
 *   web/api/addon/index.json           every target, for an overview
 *
 * served by the panel at /api/addon/... without a login. Run it through
 * web/make-addon-api.sh, which does the SourceForge listing.
 *
 * usage: node web/addon-api.mjs <base>
 *   <base>  where the listing starts below addon/: "" for the whole tree,
 *           "<arch>/<sdk>" when only that target was listed
 *
 * The document keeps lico's own format (tools/addon-index/generate.py in
 * lico-source, parsed by Addons.parseIndex): schema 1, "arch" is an object
 * keyed by arch, and each entry has id, name, category, file, url, size, md5
 * and updated. url must stay the sourceforge.net/projects/.../download form,
 * because the app derives its mirror fallbacks from that path.
 *
 * md5 matters: the app rejects a download whose md5 differs, and skips the
 * check only when md5 is empty. So an md5 is only ever taken from something
 * that is provably the same file - the previous index or the local build
 * output with the same size and time, or SourceForge's RSS feed - and left
 * empty otherwise.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import {
	ANDROID, ARCHS, PROJECT, SCHEMA, WEB, REPO,
	baseArg, bytes, iso, localMd5, parseListing, readJson, readStdin, rss, writeAtomic, writeIfChanged,
} from "./api-common.mjs";

const OUT = path.join(WEB, "api", "addon");
const base = baseArg();

/** "GoogleCalendarSyncAdapter" -> "Google Calendar Sync Adapter", "WebviewAOSP" -> "Webview AOSP" */
const humanize = (id) => id.replace(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g, " ");

/* ── Listing ────────────────────────────────────────────────────────────── */

/** "<arch>/<sdk>" -> Map(id -> entry), newest upload per id */
const targets = new Map();
let legacy = 0;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const f of parseListing(await readStdin(), base)) {
	const parts = f.path.split("/"); // arch sdk category Id file
	if (parts.length !== 5) continue;
	const [arch, sdk, category, id, file] = parts;
	if (!ARCHS.includes(arch) || !/^\d+$/.test(sdk)) continue;
	// Only the current naming; legacy AUTO-/MAKSU-/RECOVERY- zips are skipped,
	// exactly as lico's generate.py does.
	if (!new RegExp(`^${esc(id)}-LiteGapps-Addon-${esc(arch)}-[0-9.]+\\.zip$`).test(file)) {
		if (file.endsWith(".zip")) legacy++;
		continue;
	}
	const entry = {
		id,
		name: humanize(id),
		category,
		file,
		url: `https://sourceforge.net/projects/${PROJECT}/files/addon/${f.path}/download`,
		size: f.size,
		md5: "",
		updated: f.updated,
	};
	const key = `${arch}/${sdk}`;
	if (!targets.has(key)) targets.set(key, new Map());
	const byId = targets.get(key);
	const old = byId.get(id);
	if (!old || entry.updated > old.updated) byId.set(id, entry);
}

if (base && !targets.has(base)) targets.set(base, new Map());

const now = iso(Date.now());
let written = 0;
let kept = 0;

for (const [key, byId] of [...targets].sort()) {
	const [arch, sdk] = key.split("/");
	const file = path.join(OUT, arch, `${sdk}.json`);
	const prev = await readJson(file);
	const prevEntries = prev?.arch?.[arch] ?? [];

	// An empty or failed listing must never wipe an index the app relies on.
	if (!byId.size) {
		if (prevEntries.length) {
			console.log(`! ${key}: no addon found on SourceForge - keeping the existing index (${prevEntries.length} addons)`);
			kept++;
		} else {
			console.log(`- ${key}: no addon on SourceForge`);
		}
		continue;
	}

	const entries = [...byId.values()].sort(
		(a, b) => a.category.localeCompare(b.category) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
	);

	// 1. previous index, same file
	const prevByUrl = new Map(prevEntries.map((e) => [e.url, e]));
	for (const e of entries) {
		const p = prevByUrl.get(e.url);
		if (p && p.md5 && p.size === e.size && p.updated === e.updated) e.md5 = p.md5;
	}
	// 2. the zip this VPS just built and uploaded
	for (const e of entries) {
		if (!e.md5) {
			const local = path.join(REPO, "packages", "output", arch, sdk, e.category, e.id, e.file);
			e.md5 = await localMd5(local, e.size, e.updated);
		}
	}
	// 3. SourceForge's RSS feed, one request per category still missing one
	const missing = [...new Set(entries.filter((e) => !e.md5).map((e) => e.category))];
	for (const cat of missing) {
		const feed = await rss(`/addon/${arch}/${sdk}/${cat}`);
		for (const e of entries) {
			if (e.md5 || e.category !== cat) continue;
			const hit = feed.get(`/addon/${arch}/${sdk}/${cat}/${e.id}/${e.file}`);
			if (hit && (!hit.size || hit.size === e.size)) e.md5 = hit.md5;
		}
	}
	const noMd5 = entries.filter((e) => !e.md5).length;

	const doc = {
		schema: SCHEMA,
		sdk: Number(sdk),
		android: ANDROID[sdk] ?? "",
		updated: entries.reduce((m, e) => (e.updated > m ? e.updated : m), ""),
		generated: now,
		count: entries.length,
		size: entries.reduce((n, e) => n + e.size, 0),
		arch: { [arch]: entries },
	};
	await writeAtomic(file, JSON.stringify(doc) + "\n");
	written++;
	console.log(
		`- ${key}: ${entries.length} addons, updated ${doc.updated}` + (noMd5 ? ` (${noMd5} without md5)` : ""),
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
		const list = doc?.arch?.[arch];
		if (!Array.isArray(list)) continue;
		index.push({
			arch,
			sdk: Number(m[1]),
			android: doc.android ?? ANDROID[m[1]] ?? "",
			count: list.length,
			size: list.reduce((n, e) => n + (e.size ?? 0), 0),
			updated: doc.updated ?? "",
			generated: doc.generated ?? "",
			path: `addon/${arch}/${m[1]}.json`,
		});
	}
}
index.sort((a, b) => ARCHS.indexOf(a.arch) - ARCHS.indexOf(b.arch) || b.sdk - a.sdk);
await writeAtomic(
	path.join(OUT, "index.json"),
	JSON.stringify({ schema: SCHEMA, generated: now, targets: index }) + "\n",
);

/* ── README.md lists for the SourceForge Files page ─────────────────────────
 *
 * SourceForge shows a folder's README.md under its file list, so the same
 * data is written as markdown for addon/, addon/<arch>/ and
 * addon/<arch>/<sdk>/ into web/api/readme/addon/; make-addon-api.sh uploads
 * that tree. A file is only rewritten when its text changes, so rsync skips
 * the unchanged ones. The per-target README replaces the short one
 * packages/make writes.
 */

const README = path.join(WEB, "api", "readme", "addon");
const FILES = `https://sourceforge.net/projects/${PROJECT}/files/addon`;
const CATEGORIES = [
	["gapps", "Google apps"], ["core", "Core"], ["gapps_etc", "Google extras"],
	["go", "Go"], ["aosp", "AOSP"], ["etc", "Etc"],
];
const day = (s) => (s ? s.slice(0, 10) : "-");
const stamp = (s) => (s ? `${s.slice(0, 10)} ${s.slice(11, 16)} UTC` : "-");
const android = (t) => `Android ${t.android || "?"}`;
const INSTALL =
	"Every zip is a module: install it from the Modules page of Magisk, KernelSU or APatch, " +
	"then reboot. Pick the folder that matches your device's architecture and Android version.";

let readmes = 0;
const sumOf = (list, k) => list.reduce((n, t) => n + t[k], 0);
const newest = (list) => list.reduce((m, t) => (t.updated > m ? t.updated : m), "");

// addon/README.md: every Android version x arch
{
	const archs = ARCHS.filter((a) => index.some((t) => t.arch === a));
	const sdks = [...new Set(index.map((t) => t.sdk))].sort((a, b) => b - a);
	const lines = [
		"# LiteGapps Addon",
		"",
		"Single apps from LiteGapps, packaged one per zip, for every architecture and Android version below.",
		INSTALL,
		"",
		`**${sumOf(index, "count")} addons** in ${index.length} folders · last update ${stamp(newest(index))}`,
		"",
		`| Android | API | ${archs.join(" | ")} |`,
		`|---|---|${archs.map(() => "---|").join("")}`,
	];
	for (const sdk of sdks) {
		const cells = archs.map((a) => {
			const t = index.find((x) => x.arch === a && x.sdk === sdk);
			return t ? `[${t.count} addons](${FILES}/${a}/${sdk}/)` : "-";
		});
		lines.push(`| ${ANDROID[sdk] ?? "?"} | ${sdk} | ${cells.join(" | ")} |`);
	}
	lines.push("", "Folders not listed here (API 21-27) hold old addons in the previous format.", "");
	if (await writeIfChanged(path.join(README, "README.md"), lines.join("\n"))) readmes++;
}

// addon/<arch>/README.md: its Android versions
for (const arch of ARCHS) {
	const list = index.filter((t) => t.arch === arch);
	if (!list.length) continue;
	const lines = [
		`# LiteGapps Addon · ${arch}`,
		"",
		INSTALL,
		"",
		`**${sumOf(list, "count")} addons** · last update ${stamp(newest(list))}`,
		"",
		"| Android | API | Addons | Total size | Last update |",
		"|---|---|---|---|---|",
		...list.map(
			(t) =>
				`| [${android(t)}](${FILES}/${arch}/${t.sdk}/) | ${t.sdk} | ${t.count} | ${bytes(t.size)} | ${day(t.updated)} |`,
		),
		"",
	];
	if (await writeIfChanged(path.join(README, arch, "README.md"), lines.join("\n"))) readmes++;
}

// addon/<arch>/<sdk>/README.md: every addon, by category
for (const t of index) {
	const doc = await readJson(path.join(OUT, t.arch, `${t.sdk}.json`));
	const entries = doc?.arch?.[t.arch] ?? [];
	const lines = [
		`# LiteGapps Addon · ${t.arch} · ${android(t)} (API ${t.sdk})`,
		"",
		INSTALL,
		"",
		`**${t.count} addons** · ${bytes(t.size)} in total · last update ${stamp(t.updated)}`,
		"",
	];
	const known = CATEGORIES.map(([c]) => c);
	const cats = [
		...CATEGORIES,
		...[...new Set(entries.map((e) => e.category))].filter((c) => !known.includes(c)).map((c) => [c, c]),
	];
	for (const [cat, label] of cats) {
		const list = entries.filter((e) => e.category === cat);
		if (!list.length) continue;
		lines.push(
			`## ${label} (${list.length})`,
			"",
			"| Addon | File | Size | Updated | MD5 |",
			"|---|---|---|---|---|",
			...list.map(
				(e) => `| ${e.name} | [${e.file}](${e.url}) | ${bytes(e.size)} | ${day(e.updated)} | \`${e.md5 || "-"}\` |`,
			),
			"",
		);
	}
	if (await writeIfChanged(path.join(README, t.arch, String(t.sdk), "README.md"), lines.join("\n"))) readmes++;
}

if (legacy) console.log(`- ${legacy} legacy addon zips skipped (old naming)`);
console.log(`- Wrote ${written} target index(es)${kept ? `, kept ${kept}` : ""}, ${index.length} in index.json`);
console.log(`- ${readmes} README.md changed for the SourceForge Files page`);
