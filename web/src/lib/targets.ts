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
 * Default variants for a target, used until the panel's own per-target config
 * says otherwise: arm64 up to SDK 28 gets core+lite, arm64 from SDK 29 gets
 * pixel+lite+superlite, and arm/x86/x86_64 get core (+superlite from SDK 29).
 * (Same split the maintainer release build has always used.)
 */
export function defaultVariants(arch: string, sdk: number): string[] {
	if (arch === "arm64") return sdk <= 28 ? ["core", "lite"] : ["pixel", "lite", "superlite"];
	return sdk >= 29 ? ["core", "superlite"] : ["core"];
}

export type Job = {
	id: number;
	kind: string;
	label: string;
	status: "running" | "done" | "failed" | "unknown";
	exit_code: number | null;
	started_at: string;
	finished_at: string | null;
};

export type JobRequest = {
	kind: JobKind;
	variant?: string;
	variants?: string[];
	arch?: string;
	sdk?: string;
	/** database backup file name, for db-restore */
	name?: string;
	// batch build (checklist): every arch x sdk combination is built
	archs?: string[];
	sdks?: string[];
	autoVariants?: boolean;
	/** per-target variant config, resolved by the caller (server side only) */
	overrides?: Record<string, string[]>;
	/** per-variant package lists, resolved by the caller (server side only) */
	packages?: Record<string, string[]>;
	restoreMissing?: boolean;
	cleanAfter?: boolean;
	/** build the addon packages for each target first (packages/make make) */
	buildAddon?: boolean;
	/** release the addon and the zips to the SourceForge FRS afterwards */
	upload?: boolean;
};

/** Backup file names are produced by web/db-backup.sh; nothing else is accepted. */
export const BACKUP_NAME = /^litegapps-db-\d{8}-\d{6}\.lgdb$/;

/** Android version per SDK, for the checklist labels. Mirrors get_android_version() in build.sh. */
export const ANDROID: Record<number, string> = {
	21: "5.0", 22: "5.1", 23: "6.0", 24: "7.0", 25: "7.1", 26: "8.0", 27: "8.1",
	28: "9", 29: "10", 30: "11", 31: "12", 32: "12.1", 33: "13", 34: "14",
	35: "15", 36: "16", 37: "17",
};

