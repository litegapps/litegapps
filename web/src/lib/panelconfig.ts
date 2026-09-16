import type { RowDataPacket } from "mysql2";
import { db, ensureSchema } from "./db";

/*
 * The panel's own identity and version.
 *
 * The `config` in the repository is a neutral default, because everyone who
 * clones it builds with it. This machine's values - the builder name, the
 * official/unofficial marker, the version being released - live in the panel
 * database instead and are handed to each job as LG_CFG_<key>, which
 * get_config() in build.sh (and make-status.sh) reads before the file. So a
 * maintainer's identity is never committed, and a fresh clone still builds.
 */

export type PanelConfig = Record<string, string>;

/** Only identity and version: everything else stays in the repo config. */
export const PANEL_KEYS = [
	"version",
	"version.code",
	"codename",
	"name.builder",
	"build.status",
] as const;

export const PANEL_LABELS: Record<string, string> = {
	version: "Versi",
	"version.code": "Kode versi",
	codename: "Codename",
	"name.builder": "Nama builder",
	"build.status": "Status build",
};

export const PANEL_HINTS: Record<string, string> = {
	version: "Ditulis di nama zip dan module.prop, misalnya 4.9",
	"version.code": "Angka, naik tiap rilis, misalnya 49",
	codename: "stable, beta, atau lainnya",
	"name.builder": "Nama Anda; kosongkan untuk memakai isi config repo",
	"build.status": "Isi dengan kunci maintainer untuk menandai build official",
};

/** A value has to survive `grep | cut -d = -f 2-`, so keep it one plain line. */
export function badValue(v: string): string | null {
	if (v.length > 120) return "terlalu panjang";
	if (/[\p{Cc}]/u.test(v)) return "tidak boleh berisi baris baru";
	if (v !== v.trim()) return "tidak boleh diawali/diakhiri spasi";
	return null;
}

export async function readPanelConfig(): Promise<PanelConfig> {
	await ensureSchema();
	const [rows] = await db().query<RowDataPacket[]>("SELECT k, v FROM build_config");
	const out: PanelConfig = {};
	for (const r of rows) {
		const k = String(r.k);
		if ((PANEL_KEYS as readonly string[]).includes(k)) out[k] = String(r.v);
	}
	return out;
}

/** Store the values that are set; an empty one falls back to the repo config. */
export async function writePanelConfig(next: PanelConfig): Promise<number> {
	await ensureSchema();
	const c = db();

	let kept = 0;
	for (const k of PANEL_KEYS) {
		const raw = next[k];
		if (raw === undefined) continue;
		const v = raw.trim();
		if (!v) {
			await c.query("DELETE FROM build_config WHERE k = ?", [k]);
			continue;
		}
		const bad = badValue(v);
		if (bad) throw new Error(`${k}: ${bad}`);
		// Written as versionCode= in module.prop, which Magisk/KernelSU/APatch
		// compare as an integer: "5.0" there breaks update detection.
		if (k === "version.code" && !/^\d+$/.test(v)) {
			throw new Error("version.code harus angka bulat, misalnya 50");
		}
		await c.query(
			"INSERT INTO build_config (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
			[k, v],
		);
		kept++;
	}
	return kept;
}

/** LG_CFG_<key> for the build; dots become underscores, as build.sh expects. */
export function panelConfigEnv(cfg: PanelConfig): Record<string, string> {
	const env: Record<string, string> = {};
	for (const k of PANEL_KEYS) {
		const v = cfg[k];
		if (v) env[`LG_CFG_${k.replace(/[.-]/g, "_")}`] = v;
	}
	return env;
}
