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
	21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
] as const;

export type JobKind =
	| "make" | "restore" | "packages" | "status" | "clean"
	| "restore-bin" | "restore-package" | "restore-gapps" | "clean-sources"
	| "build-batch"
	| "db-backup" | "db-restore" | "db-list";

/*
 * x86 (32-bit) is supported up to Android 15 (SDK 35) only - the same rule as
 * target_supported() in build.sh. Google ships no 32-bit x86 phone image with
 * GMS after Android 11, and x86 is 0.5% of downloads. Existing releases stay;
 * nothing newer is restored or built.
 */
export const X86_LAST_SDK = 35;

export function targetSupported(arch: string, sdk: number | string): boolean {
	return !(arch === "x86" && Number(sdk) > X86_LAST_SDK);
}

export const UNSUPPORTED_MSG = `x86 (32-bit) tidak didukung untuk Android 16 (SDK ${X86_LAST_SDK + 1}) ke atas`;

/*
 * Variants that exist only for some targets - the same rule as
 * variant_supported() in build.sh. Go is made of Google's Go apps, which are
 * built for arm64 from Android 10 (SDK 29) only.
 */
export const GO_MIN_SDK = 29;

export function variantSupported(variant: string, arch: string, sdk: number | string): boolean {
	if (variant === "go") return arch === "arm64" && Number(sdk) >= GO_MIN_SDK;
	return true;
}

export const GO_UNSUPPORTED_MSG = `Varian go hanya untuk arm64 Android 10 (SDK ${GO_MIN_SDK}) ke atas`;

/*
 * Default variants for a target, used until the panel's own per-target config
 * says otherwise: arm64 up to SDK 28 gets core+lite, arm64 from SDK 29 gets
 * pixel+lite+superlite, and arm/x86/x86_64 get core (+superlite from SDK 29).
 * (Same split the maintainer release build has always used.)
 */
export function defaultVariants(arch: string, sdk: number): string[] {
	if (!targetSupported(arch, sdk)) return [];
	if (arch === "arm64") return sdk <= 28 ? ["core", "lite"] : ["pixel", "lite", "superlite"];
	return sdk >= 29 ? ["core", "superlite"] : ["core"];
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
export const KINDS_BATCH = ["build-batch"] as const;
export const KINDS_SINGLE = ["make", "packages", "restore", "clean", "status"] as const;
export const KINDS_RESTORE = [
	"restore-bin", "restore-package", "restore-gapps", "clean-sources",
] as const;
export const KINDS_BACKUP = ["db-backup", "db-restore", "db-list"] as const;

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
};

/** Backup file names are produced by web/db-backup.sh; nothing else is accepted. */
export const BACKUP_NAME = /^litegapps-db-\d{8}-\d{6}\.lgdb$/;

/** Android version per SDK, for the checklist labels. Mirrors get_android_version() in build.sh. */
export const ANDROID: Record<number, string> = {
	21: "5.0", 22: "5.1", 23: "6.0", 24: "7.0", 25: "7.1", 26: "8.0", 27: "8.1",
	28: "9", 29: "10", 30: "11", 31: "12", 32: "12.1", 33: "13", 34: "14",
	35: "15", 36: "16", 37: "17",
};

