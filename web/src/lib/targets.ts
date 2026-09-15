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

export type JobKind = "make" | "restore" | "packages" | "status" | "clean";

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
	arch?: string;
	sdk?: string;
};
