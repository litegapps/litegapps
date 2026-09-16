import { getSetting, setSetting } from "./settings";
import { ARCHS, SDKS, VARIANTS } from "./targets";

/*
 * What the build forms were set to last time.
 *
 * Picking four architectures and a dozen Android versions again on every
 * visit is busywork, so the selection is remembered in the settings table
 * when a job is started. Values are validated on the way in and on the way
 * out: this is a convenience, never a source of truth for what gets built.
 */

export type BatchPrefs = {
	archs: string[];
	sdks: number[];
	auto: boolean;
	variants: string[];
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
const SINGLE_KEY = "form.single";

export const DEFAULT_BATCH: BatchPrefs = {
	archs: ["arm64"],
	sdks: [36],
	auto: true,
	variants: ["lite"],
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
	return Array.isArray(v) ? v.filter((a): a is string => (ARCHS as readonly string[]).includes(a as string)) : [];
}

function keepSdks(v: unknown): number[] {
	return Array.isArray(v)
		? v.map(Number).filter((s) => (SDKS as readonly number[]).includes(s))
		: [];
}

function keepVariants(v: unknown): string[] {
	return Array.isArray(v)
		? v.filter((x): x is string => (VARIANTS as readonly string[]).includes(x as string))
		: [];
}

export async function readBatchPrefs(): Promise<BatchPrefs> {
	try {
		const raw = await getSetting(BATCH_KEY);
		if (!raw) return DEFAULT_BATCH;
		const p = JSON.parse(raw) as Partial<BatchPrefs>;
		const archs = keepArchs(p.archs);
		const sdks = keepSdks(p.sdks);
		const variants = keepVariants(p.variants);
		return {
			archs: archs.length ? archs : DEFAULT_BATCH.archs,
			sdks: sdks.length ? sdks : DEFAULT_BATCH.sdks,
			auto: p.auto !== false,
			variants: variants.length ? variants : DEFAULT_BATCH.variants,
			restoreMissing: p.restoreMissing !== false,
			cleanAfter: p.cleanAfter === true,
			buildAddon: p.buildAddon === true,
			upload: p.upload === true,
		};
	} catch {
		// Unreadable or from an older shape: fall back rather than fail a page.
		return DEFAULT_BATCH;
	}
}

export async function writeBatchPrefs(p: BatchPrefs): Promise<void> {
	await setSetting(
		BATCH_KEY,
		JSON.stringify({
			archs: keepArchs(p.archs),
			sdks: keepSdks(p.sdks),
			auto: p.auto,
			variants: keepVariants(p.variants),
			restoreMissing: p.restoreMissing,
			cleanAfter: p.cleanAfter,
			buildAddon: p.buildAddon,
			upload: p.upload,
		}),
	);
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
