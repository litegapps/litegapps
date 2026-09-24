import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./paths";

/*
 * The public indexes under web/api/, served without a login:
 *  - addon/      the addon list the LiteGapps Controller app (lico) downloads,
 *                written by web/make-addon-api.sh;
 *  - litegapps/  the newest release of every variant per target, written by
 *                web/make-release-api.sh.
 * Pages and the public routes only ever read those files - nothing here
 * talks to SourceForge.
 */

export type AddonEntry = {
	id: string;
	name: string;
	category: string;
	file: string;
	url: string;
	size: number;
	md5: string;
	updated: string;
};

export type AddonDoc = {
	schema: number;
	sdk: number;
	android: string;
	updated: string;
	generated: string;
	count: number;
	size: number;
	arch: Record<string, AddonEntry[]>;
};

export type AddonTarget = {
	arch: string;
	sdk: number;
	android: string;
	count: number;
	size: number;
	updated: string;
	generated: string;
	path: string;
};

export type ReleaseFile = {
	file: string;
	/** "" for the normal zip; auto / magisk / maksu / recovery on older releases */
	flavour: string;
	url: string;
	size: number;
	md5: string;
	updated: string;
};

export type ReleaseVariant = {
	variant: string;
	/** release folder date (YYYY-MM-DD), or the upload day of a legacy zip */
	date: string;
	legacy: boolean;
	version?: string;
	file: string;
	url: string;
	size: number;
	md5: string;
	updated: string;
	files: ReleaseFile[];
};

export type ReleaseDoc = {
	schema: number;
	arch: string;
	sdk: number;
	android: string;
	updated: string;
	generated: string;
	count: number;
	variants: Record<string, ReleaseVariant>;
};

export type ReleaseTarget = {
	arch: string;
	sdk: number;
	android: string;
	updated: string;
	generated: string;
	variants: Record<string, string>;
	path: string;
};

export const ADDON_ARCHS = ["arm64", "arm", "x86", "x86_64"] as const;

/** The two published trees, as the URL names them. */
export type ApiTree = "addon" | "litegapps";

export function apiDir(tree: ApiTree): string {
	return path.join(repoRoot(), "web", "api", tree);
}

export function addonApiDir(): string {
	return apiDir("addon");
}

/**
 * Path of one published file, or null when the name is not one the generator
 * writes. Checked against a fixed pattern, so a request can never step out of
 * the directory.
 */
export function apiFile(tree: ApiTree, arch: string, file: string): string | null {
	if (!(ADDON_ARCHS as readonly string[]).includes(arch)) return null;
	if (!/^\d{1,3}\.json$/.test(file)) return null;
	return path.join(apiDir(tree), arch, file);
}

export function addonApiFile(arch: string, file: string): string | null {
	return apiFile("addon", arch, file);
}

export async function readReleaseIndex(): Promise<{ generated: string; targets: ReleaseTarget[] } | null> {
	try {
		return JSON.parse(
			await readFile(/*turbopackIgnore: true*/ path.join(apiDir("litegapps"), "index.json"), "utf8"),
		);
	} catch {
		return null;
	}
}

export async function readReleaseDoc(arch: string, sdk: number): Promise<ReleaseDoc | null> {
	const file = apiFile("litegapps", arch, `${sdk}.json`);
	if (!file) return null;
	try {
		return JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8"));
	} catch {
		return null;
	}
}

export async function readAddonIndex(): Promise<{ generated: string; targets: AddonTarget[] } | null> {
	try {
		return JSON.parse(
			await readFile(/*turbopackIgnore: true*/ path.join(addonApiDir(), "index.json"), "utf8"),
		);
	} catch {
		return null;
	}
}

export async function readAddonDoc(arch: string, sdk: number): Promise<AddonDoc | null> {
	const file = addonApiFile(arch, `${sdk}.json`);
	if (!file) return null;
	try {
		return JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8"));
	} catch {
		return null;
	}
}

/** Serve one generated file as public JSON: no login, short cache, 404 as JSON. */
export async function serveApiFile(file: string | null): Promise<Response> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json; charset=utf-8",
		"Access-Control-Allow-Origin": "*",
		"X-Robots-Tag": "noindex",
	};
	if (!file) {
		return new Response('{"error":"not found"}\n', { status: 404, headers: { ...headers, "Cache-Control": "no-store" } });
	}
	try {
		const [body, st] = await Promise.all([
			readFile(/*turbopackIgnore: true*/ file),
			stat(/*turbopackIgnore: true*/ file),
		]);
		return new Response(body, {
			headers: {
				...headers,
				// Short: a fresh upload should reach the app within minutes.
				"Cache-Control": "public, max-age=300",
				"Last-Modified": st.mtime.toUTCString(),
			},
		});
	} catch {
		return new Response('{"error":"not found"}\n', { status: 404, headers: { ...headers, "Cache-Control": "no-store" } });
	}
}
