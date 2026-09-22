import { readFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./paths";

/*
 * The availability matrix comes from status.json on disk, written by
 * web/make-status.sh. The web process deliberately never talks to
 * SourceForge itself: that would need the release ssh key inside the
 * request path, and a 600-file rsync per page load.
 */

export type Target = {
	gapps: boolean;
	lite: boolean;
	superlite: boolean;
	package: boolean;
	release: string;
	variants: string[];
	/** newest pre-dated-folder release ("v2.5"), when that is all a target has */
	legacy?: string;
	legacy_variants?: string[];
};

export type Status = {
	generated: string;
	version: { version: string; code: string; codename: string; status: string };
	latest_release: string;
	archs: string[];
	sdks: { sdk: number; android: string }[];
	targets: Record<string, Record<string, Target>>;
};

export async function readStatus(): Promise<Status | null> {
	try {
		const file = process.env.STATUS_JSON ?? path.join(repoRoot(), "web", "status.json");
		// The path is resolved at runtime on purpose (it lives outside the app
		// dir, next to build.sh). Without this, Next traces the whole repo into
		// the standalone output.
		return JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8")) as Status;
	} catch {
		// Missing or unreadable: the page shows a "run make-status.sh" notice
		// rather than failing, so the panel still works for building.
		return null;
	}
}
