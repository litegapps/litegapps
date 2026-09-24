import { getSetting, setSetting } from "./settings";
import { ARCHS, SDKS, VARIANTS, targetSupported } from "./targets";

/*
 * What the build forms were set to last time.
 *
 * Picking four architectures and a dozen Android versions again on every
 * visit is busywork, so the selection is remembered in the settings table
 * when a job is started. Values are validated on the way in and on the way
 * out: this is a convenience, never a source of truth for what gets built.
 */

export type BatchPrefs = {
	/** ticked targets, "<arch>-<sdk>" */
	targets: string[];
	restoreMissing: boolean;
	cleanAfter: boolean;
	buildAddon: boolean;
	upload: boolean;
};

export type SinglePrefs = {
	kind: string;
	variant: string;
	arch: string;
	sdk: string;
};

const BATCH_KEY = "form.batch";
/**
 * The Auto tab's own checklist - what the monthly auto build builds. Kept
 * apart from the Multi tab's manual one so ticking a target for a quick test
 * build never changes the monthly release.
 */
const AUTO_KEY = "form.auto";
const SINGLE_KEY = "form.single";

export const DEFAULT_BATCH: BatchPrefs = {
	targets: ["arm64-36"],
	restoreMissing: true,
	cleanAfter: false,
	buildAddon: false,
	upload: false,
};

export const DEFAULT_SINGLE: SinglePrefs = {
	kind: "make",
	variant: "lite",
	arch: "arm64",
	sdk: "36",
};

const SINGLE_KINDS = ["make", "packages", "restore", "status", "clean"];

function keepArchs(v: unknown): string[] {
	return Array.isArray(v)
		? v.filter((a): a is string => (ARCHS as readonly string[]).includes(a as string))
		: [];
}

function keepSdks(v: unknown): number[] {
	return Array.isArray(v)
		? v.map(Number).filter((s) => (SDKS as readonly number[]).includes(s))
		: [];
}

function keepTargets(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return [...new Set(v.map(String))].filter((k) => {
		const i = k.lastIndexOf("-");
		if (i < 1) return false;
		return (
			(ARCHS as readonly string[]).includes(k.slice(0, i)) &&
			(SDKS as readonly number[]).includes(Number(k.slice(i + 1))) &&
			targetSupported(k.slice(0, i), Number(k.slice(i + 1)))
		);
	});
}


/**
 * The Multi tab's saved selection. `fallback` fills an empty target list with
 * the form's default (arm64-36) so the page never opens blank; the monthly
 * auto build passes false, because nothing ticked must mean nothing built.
 */
export async function readBatchPrefs(fallback = true, key = BATCH_KEY): Promise<BatchPrefs> {
	const empty = fallback ? DEFAULT_BATCH.targets : [];
	try {
		const raw = await getSetting(key);
		if (!raw) return { ...DEFAULT_BATCH, targets: empty };
		const p = JSON.parse(raw) as Partial<BatchPrefs> & { archs?: unknown; sdks?: unknown };
		// Rows written before the checklist became a matrix held arch x sdk
		// lists; they turn into the same set of targets.
		let targets = keepTargets(p.targets);
		if (!targets.length) {
			const archs = keepArchs(p.archs);
			const sdks = keepSdks(p.sdks);
			targets = archs.flatMap((a) => sdks.map((s) => `${a}-${s}`));
		}
		return {
			targets: targets.length ? targets : empty,
			restoreMissing: p.restoreMissing !== false,
			cleanAfter: p.cleanAfter === true,
			buildAddon: p.buildAddon === true,
			upload: p.upload === true,
		};
	} catch {
		// Unreadable or from an older shape: fall back rather than fail a page.
		return { ...DEFAULT_BATCH, targets: empty };
	}
}

export async function writeBatchPrefs(p: BatchPrefs, key = BATCH_KEY): Promise<void> {
	await setSetting(
		key,
		JSON.stringify({
			targets: keepTargets(p.targets),
			restoreMissing: p.restoreMissing,
			cleanAfter: p.cleanAfter,
			buildAddon: p.buildAddon,
			upload: p.upload,
		}),
	);
}

/**
 * The Auto tab's checklist. The first time it is read it starts as a copy of
 * the Multi tab's current one, so switching the monthly build over to its own
 * list does not suddenly leave it empty; from then on the two are separate.
 */
export async function readAutoPrefs(): Promise<BatchPrefs> {
	if ((await getSetting(AUTO_KEY)) === null) {
		await writeBatchPrefs(await readBatchPrefs(false), AUTO_KEY);
	}
	return readBatchPrefs(false, AUTO_KEY);
}

export async function writeAutoPrefs(p: BatchPrefs): Promise<void> {
	await writeBatchPrefs(p, AUTO_KEY);
}

export async function readSinglePrefs(): Promise<SinglePrefs> {
	try {
		const raw = await getSetting(SINGLE_KEY);
		if (!raw) return DEFAULT_SINGLE;
		const p = JSON.parse(raw) as Partial<SinglePrefs>;
		return {
			kind: SINGLE_KINDS.includes(p.kind ?? "") ? p.kind! : DEFAULT_SINGLE.kind,
			variant: (VARIANTS as readonly string[]).includes(p.variant ?? "")
				? p.variant!
				: DEFAULT_SINGLE.variant,
			arch: (ARCHS as readonly string[]).includes(p.arch ?? "") ? p.arch! : DEFAULT_SINGLE.arch,
			sdk: (SDKS as readonly number[]).includes(Number(p.sdk)) ? String(p.sdk) : DEFAULT_SINGLE.sdk,
		};
	} catch {
		return DEFAULT_SINGLE;
	}
}

export async function writeSinglePrefs(p: SinglePrefs): Promise<void> {
	const clean = {
		kind: SINGLE_KINDS.includes(p.kind) ? p.kind : DEFAULT_SINGLE.kind,
		variant: (VARIANTS as readonly string[]).includes(p.variant) ? p.variant : DEFAULT_SINGLE.variant,
		arch: (ARCHS as readonly string[]).includes(p.arch) ? p.arch : DEFAULT_SINGLE.arch,
		sdk: (SDKS as readonly number[]).includes(Number(p.sdk)) ? String(p.sdk) : DEFAULT_SINGLE.sdk,
	};
	await setSetting(SINGLE_KEY, JSON.stringify(clean));
}
