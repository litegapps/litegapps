import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./paths";

/*
 * Editor for the shell build configs (`config`, `packages/config`, each
 * variant's `config`).
 *
 * The files are plain `key=value` lines read by getp()/get_config() in
 * build.sh, with comments that document the allowed values. Saving only ever
 * rewrites the value of a key that is already in the file: comments, blank
 * lines, order and unknown keys are kept byte for byte, so a panel edit can
 * never turn into a rewrite of a file the build depends on.
 */

export type ConfigFile = {
	id: string;
	label: string;
	file: string; // repo-relative
	note?: string;
};

function variantFile(v: string): ConfigFile {
	return {
		id: `litegapps:${v}`,
		label: v,
		file: `core/litegapps/${v}/config`,
		note: `Varian ${v}: target build dan restore-nya sendiri.`,
	};
}

/*
 * Allowlist of editable files. Anything not in here cannot be read or written
 * through the panel, so a crafted form field cannot reach another file.
 */
export const CONFIG_FILES: ConfigFile[] = [
	{
		id: "main",
		label: "Utama",
		file: "config",
		note: "Versi, kompresi, dan produk/varian mana yang dibangun oleh sh build.sh make tanpa argumen.",
	},
	{
		id: "packages",
		label: "Packages",
		file: "packages/config",
		note: "Dipakai packages/make saat dijalankan tanpa argumen arch/SDK.",
	},
	...["lite", "core", "go", "micro", "pixel", "nano", "basic", "user", "superlite"].map(variantFile),
	{
		id: "litegappsx:microg",
		label: "microg",
		file: "core/litegappsx/microg/config",
		note: "Produk kedua (litegappsx), mati secara default.",
	},
];

export function configFile(id: string): ConfigFile | null {
	return CONFIG_FILES.find((f) => f.id === id) ?? null;
}

export type ConfigEntry = {
	key: string;
	value: string;
	/** comment lines sitting directly above the key, without the leading # */
	hint: string[];
};

export type ConfigDoc = {
	id: string;
	label: string;
	file: string;
	note?: string;
	entries: ConfigEntry[];
	raw: string;
};

const KEY_LINE = /^([A-Za-z0-9_.-]+)=(.*)$/;

export async function readConfigDoc(id: string): Promise<ConfigDoc | null> {
	const f = configFile(id);
	if (!f) return null;
	const full = path.join(repoRoot(), f.file);
	let raw: string;
	try {
		// Outside the app directory, like every other repo path this app reads.
		raw = await readFile(/*turbopackIgnore: true*/ full, "utf8");
	} catch {
		return null;
	}

	const entries: ConfigEntry[] = [];
	let hint: string[] = [];
	const seen = new Set<string>();
	for (const line of raw.split("\n")) {
		if (line.startsWith("#")) {
			hint.push(line.replace(/^#\s?/, ""));
			continue;
		}
		const m = KEY_LINE.exec(line);
		if (m && !seen.has(m[1])) {
			seen.add(m[1]);
			entries.push({ key: m[1], value: m[2], hint });
		}
		hint = [];
	}

	return { id: f.id, label: f.label, file: f.file, note: f.note, entries, raw };
}

/** A value has to survive a shell `grep | cut -d = -f 2`, so keep it to one plain line. */
export function badValue(value: string): string | null {
	if (value.length > 500) return "nilai terlalu panjang";
	if (/[\p{Cc}]/u.test(value)) return "nilai tidak boleh berisi baris baru";
	if (value !== value.trim()) return "nilai tidak boleh diawali/diakhiri spasi";
	return null;
}

/**
 * Write new values for keys that already exist in the file. Returns the keys
 * that actually changed. Unknown keys are ignored rather than appended.
 */
export async function writeConfigDoc(
	id: string,
	values: Record<string, string>,
): Promise<string[]> {
	const doc = await readConfigDoc(id);
	if (!doc) throw new Error(`unknown config: ${id}`);

	for (const [k, v] of Object.entries(values)) {
		const bad = badValue(v);
		if (bad) throw new Error(`${k}: ${bad}`);
	}

	const known = new Set(doc.entries.map((e) => e.key));
	const changed: string[] = [];
	const done = new Set<string>();

	const out = doc.raw.split("\n").map((line) => {
		const m = KEY_LINE.exec(line);
		if (!m || done.has(m[1])) return line;
		const key = m[1];
		if (!(key in values) || !known.has(key)) return line;
		done.add(key);
		const next = values[key];
		if (next === m[2]) return line;
		changed.push(key);
		return `${key}=${next}`;
	});

	if (changed.length === 0) return [];

	// Write beside the target and rename, so a crash cannot leave the build
	// with a half-written config.
	const full = path.join(repoRoot(), doc.file);
	const tmp = `${full}.panel.tmp`;
	await writeFile(/*turbopackIgnore: true*/ tmp, out.join("\n"), "utf8");
	await rename(/*turbopackIgnore: true*/ tmp, full);
	return changed;
}
