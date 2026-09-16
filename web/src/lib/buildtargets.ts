import type { RowDataPacket } from "mysql2";
import { db, ensureSchema } from "./db";
import { ARCHS, SDKS, VARIANTS, defaultVariants, targetSupported } from "./targets";

/*
 * Which variants each arch x SDK is built with.
 *
 * The shell build takes its targets from the command line, so this - not
 * `config` and not the per-variant configs under core/ - decides what gets
 * built. It lives in the database so it survives a redeploy and travels with
 * the backup, and the batch job receives the resolved list in its argv rather
 * than reading any file.
 *
 * A target with no row falls back to defaultVariants(); a row with an empty
 * list means "do not build this target".
 */

export type Overrides = Record<string, string[]>; // "<arch>-<sdk>" -> variants

export function keyOf(arch: string, sdk: number | string): string {
	return `${arch}-${sdk}`;
}

/** Variants for one target: the stored config if there is one, else the default. */
export function resolveVariants(arch: string, sdk: number, overrides: Overrides): string[] {
	if (!targetSupported(arch, sdk)) return [];
	return overrides[keyOf(arch, sdk)] ?? defaultVariants(arch, sdk);
}

export async function readOverrides(): Promise<Overrides> {
	await ensureSchema();
	const [rows] = await db().query<RowDataPacket[]>(
		"SELECT arch, sdk, variants FROM build_targets",
	);

	const out: Overrides = {};
	for (const r of rows) {
		const arch = String(r.arch);
		const sdk = Number(r.sdk);
		if (!(ARCHS as readonly string[]).includes(arch)) continue;
		if (!(SDKS as readonly number[]).includes(sdk)) continue;
		out[keyOf(arch, sdk)] = String(r.variants)
			.split(",")
			.map((v) => v.trim())
			.filter((v) => (VARIANTS as readonly string[]).includes(v));
	}
	return out;
}

/**
 * Replace the stored config. Targets that match the default are deleted
 * instead of stored, so the table only holds real changes and a later change
 * to the default still reaches them.
 */
export async function writeOverrides(next: Overrides): Promise<number> {
	await ensureSchema();
	const c = db();

	let kept = 0;
	for (const arch of ARCHS) {
		for (const sdk of SDKS) {
			const picked = next[keyOf(arch, sdk)];
			if (!picked) continue;
			if (!targetSupported(arch, sdk)) {
				await c.query("DELETE FROM build_targets WHERE arch = ? AND sdk = ?", [arch, sdk]);
				continue;
			}

			const def = defaultVariants(arch, sdk);
			const isDefault = picked.length === def.length && picked.every((v) => def.includes(v));
			if (isDefault) {
				await c.query("DELETE FROM build_targets WHERE arch = ? AND sdk = ?", [arch, sdk]);
				continue;
			}

			const list = picked.filter((v) => (VARIANTS as readonly string[]).includes(v)).join(",");
			await c.query(
				"INSERT INTO build_targets (arch, sdk, variants) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE variants = VALUES(variants)",
				[arch, sdk, list],
			);
			kept++;
		}
	}
	return kept;
}

/**
 * The argv form the batch job gets: "<arch>:<sdk>=<variant,...>" per target,
 * so the job records exactly what it was asked to build instead of depending
 * on state that may change while it runs.
 */
export function targetSpec(
	targets: { arch: string; sdk: number }[],
	overrides: Overrides,
): string {
	return targets
		.map((t) => `${t.arch}:${t.sdk}=${resolveVariants(t.arch, t.sdk, overrides).join(",")}`)
		.join(";");
}

/** "<arch>-<sdk>" (as the checklist and the config table key them) -> target. */
export function parseTargetKey(key: string): { arch: string; sdk: number } | null {
	const i = key.lastIndexOf("-");
	if (i < 1) return null;
	const arch = key.slice(0, i);
	const sdk = Number(key.slice(i + 1));
	if (!(ARCHS as readonly string[]).includes(arch)) return null;
	if (!(SDKS as readonly number[]).includes(sdk)) return null;
	return { arch, sdk };
}
