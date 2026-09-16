import { readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./paths";
import { ARCHS, SDKS, VARIANTS } from "./targets";

/*
 * What the restore scripts have already put on disk in this checkout.
 * Read straight from the bind-mounted repo, the same paths build.sh and
 * packages/make restore into, so it can never disagree with them.
 */

export type LocalFile = { present: boolean; bytes: number };

export type VariantState = {
	variant: string;
	gapps: boolean; // core/litegapps/<v>/gapps/<arch>/<sdk> has content
	zips: string[]; // cached downloads under core/litegapps/<v>/files/<arch>/<sdk>
};

export type TargetState = {
	arch: string;
	sdk: number;
	packageFiles: boolean; // packages/files/<arch>/<sdk> has content
	packageZip: LocalFile; // packages/zip-server/<arch>/<sdk>.zip
	variants: VariantState[];
};

export type RestoreOverview = {
	bin: boolean; // bin/<arch> exists for at least one arch
	binArchs: string[];
	binZip: LocalFile;
	disk: { free: number; total: number } | null;
	// Every arch/sdk that has anything restored, for the summary list.
	restored: { arch: string; sdk: number; package: boolean; variants: string[] }[];
};

// Paths below are built at runtime and live outside the app directory, so
// each fs call carries turbopackIgnore to keep the repo out of the trace.

async function nonEmptyDir(p: string): Promise<boolean> {
	try {
		return (await readdir(/*turbopackIgnore: true*/ p)).length > 0;
	} catch {
		return false;
	}
}

async function fileInfo(p: string): Promise<LocalFile> {
	try {
		const s = await stat(/*turbopackIgnore: true*/ p);
		return { present: s.isFile(), bytes: s.size };
	} catch {
		return { present: false, bytes: 0 };
	}
}

async function listZips(p: string): Promise<string[]> {
	try {
		return (await readdir(/*turbopackIgnore: true*/ p)).filter((f) => f.endsWith(".zip"));
	} catch {
		return [];
	}
}

export async function readTargetState(arch: string, sdk: number): Promise<TargetState> {
	const root = repoRoot();
	const a = arch;
	const s = String(sdk);
	const [packageFiles, packageZip, variants] = await Promise.all([
		nonEmptyDir(path.join(root, "packages", "files", a, s)),
		fileInfo(path.join(root, "packages", "zip-server", a, `${s}.zip`)),
		Promise.all(
			VARIANTS.map(async (v) => ({
				variant: v,
				gapps: await nonEmptyDir(path.join(root, "core", "litegapps", v, "gapps", a, s)),
				zips: await listZips(path.join(root, "core", "litegapps", v, "files", a, s)),
			})),
		),
	]);
	return { arch, sdk, packageFiles, packageZip, variants };
}

export async function readRestoreOverview(): Promise<RestoreOverview> {
	const root = repoRoot();

	const binArchs: string[] = [];
	for (const a of ARCHS) {
		if (await nonEmptyDir(path.join(root, "bin", a))) binArchs.push(a);
	}

	let disk: RestoreOverview["disk"] = null;
	try {
		const f = await statfs(/*turbopackIgnore: true*/ root);
		disk = { free: f.bavail * f.bsize, total: f.blocks * f.bsize };
	} catch {
		// statfs unsupported here: the page just omits the free-space hint.
	}

	const restored: RestoreOverview["restored"] = [];
	for (const a of ARCHS) {
		for (const sdk of SDKS) {
			const s = String(sdk);
			const pkg = await nonEmptyDir(path.join(root, "packages", "files", a, s));
			const vs: string[] = [];
			for (const v of VARIANTS) {
				if (await nonEmptyDir(path.join(root, "core", "litegapps", v, "gapps", a, s))) vs.push(v);
			}
			if (pkg || vs.length) restored.push({ arch: a, sdk, package: pkg, variants: vs });
		}
	}

	return {
		bin: binArchs.length > 0,
		binArchs,
		binZip: await fileInfo(path.join(root, "files", "bin.zip")),
		disk,
		restored,
	};
}

export function formatBytes(n: number): string {
	if (!n) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
	return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
