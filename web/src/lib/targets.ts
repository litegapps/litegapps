/*
 * Build targets and job shapes.
 *
 * Deliberately free of server-only imports: the build form is a client
 * component and needs these lists, so anything pulled in here would end up
 * in the browser bundle.
 */

export const VARIANTS = [
	"lite", "core", "go", "micro", "pixel", "nano", "basic", "user", "superlite",
] as const;

export const ARCHS = ["arm64", "arm", "x86", "x86_64"] as const;

export const SDKS = [
	24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
] as const;

export type JobKind =
	| "make" | "restore" | "packages" | "status" | "clean"
	| "restore-bin" | "restore-package" | "restore-gapps" | "clean-sources" | "clear-output"
	| "mirror-check" | "mirror-sync" | "mirror-file"
	| "build-batch"
	| "db-backup" | "db-restore" | "db-list";

/*
 * The 32-bit architectures stop at a last Android version - the same rules as
 * target_supported() in build.sh. Existing releases stay; nothing newer is
 * restored or built.
 *  - x86 up to Android 11 (SDK 30): the last version Google shipped a 32-bit
 *    x86 phone image with GMS for, and x86 is 0.5% of downloads.
 *  - arm up to Android 16 (SDK 36): no 32-bit arm phone image, GSI or
 *    MindTheGapps phone build exists for Android 17 (TV only), and no custom
 *    ROM runs Android 17 on a 32-bit phone.
 */
export const X86_LAST_SDK = 30;
export const ARM_LAST_SDK = 36;
/**
 * Oldest target on every arch, as MIN_SDK in build.sh: Android 5.0-6.0
 * (SDK 21-23) were dropped, so they are not even listed in SDKS.
 */
export const MIN_SDK = 24;

export function targetSupported(arch: string, sdk: number | string): boolean {
	const n = Number(sdk);
	// Number("abc") is NaN and fails every comparison, so test for an integer.
	if (!Number.isInteger(n) || n < MIN_SDK) return false;
	if (arch === "x86") return Number(sdk) <= X86_LAST_SDK;
	if (arch === "arm") return Number(sdk) <= ARM_LAST_SDK;
	return true;
}

/** Every cut-off in one line, for legends that cover the whole matrix. */
export const UNSUPPORTED_MSG =
	`x86 (32-bit) hanya sampai Android 11 (SDK ${X86_LAST_SDK}), ` +
	`arm (32-bit) hanya sampai Android 16 (SDK ${ARM_LAST_SDK})`;

/** Why one target is refused. */
export function unsupportedReason(arch: string, sdk: number | string): string {
	const n = Number(sdk);
	if (!Number.isInteger(n) || n < MIN_SDK) {
		return `Android di bawah 7.0 (SDK ${MIN_SDK}) tidak didukung lagi`;
	}
	if (arch === "arm") {
		return `arm (32-bit) tidak didukung untuk Android 17 (SDK ${ARM_LAST_SDK + 1}) ke atas`;
	}
	if (arch === "x86") {
		return `x86 (32-bit) tidak didukung untuk Android 12 (SDK ${X86_LAST_SDK + 1}) ke atas`;
	}
	return `${arch} SDK ${sdk} tidak didukung`;
}

/*
 * Variants that exist only for some targets - the same rule as
 * variant_supported() in build.sh. go (Google's Go apps) and superlite are
 * built for arm64 from Android 10 (SDK 29) only.
 */
export const GO_MIN_SDK = 29;

export function variantSupported(variant: string, arch: string, sdk: number | string): boolean {
	if (variant === "go" || variant === "superlite") {
		return arch === "arm64" && Number(sdk) >= GO_MIN_SDK;
	}
	return true;
}

export const GO_UNSUPPORTED_MSG = `Varian go dan superlite hanya untuk arm64 Android 10 (SDK ${GO_MIN_SDK}) ke atas`;

/*
 * Default variants for a target, used until the panel's own per-target config
 * says otherwise: arm64 up to SDK 28 gets core+lite, arm64 from SDK 29 gets
 * pixel+lite+superlite, and arm/x86/x86_64 get core.
 * (Same split the maintainer release build has always used.)
 */
export function defaultVariants(arch: string, sdk: number): string[] {
	if (!targetSupported(arch, sdk)) return [];
	if (arch === "arm64") return sdk <= 28 ? ["core", "lite"] : ["pixel", "lite", "superlite"];
	return ["core"];
}

export type Job = {
	id: number;
	kind: string;
	label: string;
	status: "running" | "done" | "failed" | "unknown" | "stopped";
	exit_code: number | null;
	started_at: string;
	finished_at: string | null;
};

/*
 * Which job kinds belong to which page, so the terminal panel and the job
 * history on that page show the same set of work.
 */
export const KINDS_BATCH = ["build-batch", "clear-output"] as const;
export const KINDS_SINGLE = ["make", "packages", "restore", "clean", "status", "clear-output"] as const;
export const KINDS_RESTORE = [
	"restore-bin", "restore-package", "restore-gapps", "clean-sources",
] as const;
export const KINDS_BACKUP = ["db-backup", "db-restore", "db-list"] as const;
export const KINDS_MIRROR = ["mirror-check", "mirror-sync", "mirror-file"] as const;

/** One mirrored source file, as web/gdrive-mirror.sh accepts it. */
export const MIRROR_PATH_RE = /^(litegapps|package|bin|base)\/(?!.*\.\.)[A-Za-z0-9_./-]+[A-Za-z0-9_-]$/;

export type JobRequest = {
	kind: JobKind;
	variant?: string;
	variants?: string[];
	arch?: string;
	sdk?: string;
	/** database backup file name, for db-restore */
	name?: string;
	// batch build (checklist): every arch x sdk combination is built, with the
	// variants the panel's per-target config gives it
	/** ticked "<arch>-<sdk>" targets for a batch build */
	targets?: string[];
	/** per-target variant config, resolved by the caller (server side only) */
	overrides?: Record<string, string[]>;
	/** per-variant package lists, resolved by the caller (server side only) */
	packages?: Record<string, string[]>;
	/** the panel's own identity/version config, resolved by the caller */
	config?: Record<string, string>;
	restoreMissing?: boolean;
	cleanAfter?: boolean;
	/** build the addon packages for each target first (packages/make make) */
	buildAddon?: boolean;
	/** release the addon and the zips to the SourceForge FRS afterwards */
	upload?: boolean;
	/** SourceForge release retention, resolved by the caller (server side only) */
	retention?: { on: boolean; keep: number };
	/** Google Drive mirror target, resolved by the caller (server side only) */
	mirror?: { remote: string; dir: string };
	/** one mirrored file for mirror-file, relative to files-server/ */
	path?: string;
	/** where restores download sources from, resolved by the caller */
	source?: { prefer: "sf" | "drive"; remote: string; dir: string };
};

/** Backup file names are produced by web/db-backup.sh; nothing else is accepted. */
export const BACKUP_NAME = /^litegapps-db-\d{8}-\d{6}\.lgdb$/;

/** Android version per SDK, for the checklist labels. Mirrors get_android_version() in build.sh. */
export const ANDROID: Record<number, string> = {
	24: "7.0", 25: "7.1", 26: "8.0", 27: "8.1",
	28: "9", 29: "10", 30: "11", 31: "12", 32: "12.1", 33: "13", 34: "14",
	35: "15", 36: "16", 37: "17",
};

