import type { RowDataPacket } from "mysql2";
import { db, ensureSchema } from "./db";

/*
 * Which apps from the addon build are added to each variant.
 *
 * The build ships these lists in lib/litegapps.sh; the panel keeps its own
 * copy in the database and hands it to the build through the environment, so
 * a change here needs no edit of a tracked shell file and travels with the
 * database backup. A list that is not stored falls back to the built-in one.
 */

export type PackageLists = Record<string, string[]>;

/** Mirror of the defaults in lib/litegapps.sh - keep the two in step. */
export const DEFAULT_PACKAGES: PackageLists = {
	micro: `AndroidAuto Arcore SettingsIntelligenceGoogle DeskClockGoogle SoundPicker Chrome
Gmail Files GoogleAssistant GoogleCalculator GoogleCalendar GoogleContacts
GoogleDialer GoogleKeyboard GoogleTTS LocationHistory MarkupGoogle Messaging
PixelLauncher PixelLiveWallpaper Talkback Turbo Velvet GoogleSearch
WallpaperPicker Wellbeing`.split(/\s+/),
	nano: `AndroidAuto Arcore DeskClockGoogle DevicePolicy DreamLiner Gmail GoogleAssistant
GoogleCalculator GoogleCalendar GoogleContacts GoogleDialer GoogleKeyboard
LocationHistory MarkupGoogle Messaging PlayGames SoundPicker WallpaperPicker
Wellbeing`.split(/\s+/),
	basic: `AndroidAuto Arcore DevicePolicy GoogleDialer GoogleContacts LocationHistory
MarkupGoogle SoundPicker Wellbeing`.split(/\s+/),
	user: "Chrome GoogleKeyboard PixelLauncher PixelLiveWallpaper Gmail".split(/\s+/),
	go: "AssistantGo GalleryGo GmailGo MapsGo NavigationGo VelvetGo".split(/\s+/),
	// Apps that already ship inside every base gapps zip, so the "core" addon
	// packages with these names are skipped instead of duplicated as modules.
	"core.keep":
		"GoogleServicesFramework GmsCore GoogleCalendarSyncAdapter PlayStore Phonesky GoogleContactsSyncAdapter".split(
			/\s+/,
		),
};

/** The lists the panel lets you edit, in display order. */
export const PACKAGE_LISTS = ["micro", "nano", "basic", "user", "go", "core.keep"] as const;

/** Package directory names: what `ls` in the addon output yields. */
const NAME = /^[A-Za-z0-9._-]{1,64}$/;

export function cleanList(items: string[]): string[] {
	const seen = new Set<string>();
	for (const raw of items) {
		const n = raw.trim();
		if (NAME.test(n)) seen.add(n);
	}
	return [...seen];
}

export async function readPackageLists(): Promise<PackageLists> {
	await ensureSchema();
	const [rows] = await db().query<RowDataPacket[]>("SELECT name, items FROM package_lists");

	const out: PackageLists = {};
	for (const r of rows) {
		const name = String(r.name);
		if (!(PACKAGE_LISTS as readonly string[]).includes(name)) continue;
		out[name] = cleanList(String(r.items).split(/[\s,]+/));
	}
	return out;
}

/** Stored list, or the built-in default. */
export function resolveList(name: string, stored: PackageLists): string[] {
	return stored[name] ?? DEFAULT_PACKAGES[name] ?? [];
}

/** Save; a list equal to the default is deleted so defaults keep flowing through. */
export async function writePackageLists(next: PackageLists): Promise<number> {
	await ensureSchema();
	const c = db();

	let kept = 0;
	for (const name of PACKAGE_LISTS) {
		const items = next[name];
		if (!items) continue;
		const clean = cleanList(items);
		const def = DEFAULT_PACKAGES[name] ?? [];
		const same = clean.length === def.length && clean.every((v) => def.includes(v));
		if (same) {
			await c.query("DELETE FROM package_lists WHERE name = ?", [name]);
			continue;
		}
		await c.query(
			"INSERT INTO package_lists (name, items) VALUES (?, ?) ON DUPLICATE KEY UPDATE items = VALUES(items)",
			[name, clean.join(" ")],
		);
		kept++;
	}
	return kept;
}

/*
 * Environment for the build: LG_PKGS_<VARIANT> and LG_CORE_KEEP, which
 * lib/litegapps.sh reads in place of its built-in lists. Only lists that
 * actually differ are passed, so the build keeps its own defaults otherwise.
 */
export function packageEnv(stored: PackageLists): Record<string, string> {
	const env: Record<string, string> = {};
	for (const name of PACKAGE_LISTS) {
		const items = stored[name];
		if (!items) continue;
		const key = name === "core.keep" ? "LG_CORE_KEEP" : `LG_PKGS_${name.toUpperCase()}`;
		env[key] = cleanList(items).join(" ");
	}
	return env;
}
