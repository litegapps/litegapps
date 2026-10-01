/*
 * Progress table for a batch build, read from the log web/build-batch.sh
 * already prints - the script keeps no state of its own, so its output is the
 * only honest report of how far a run has got.
 *
 * Lines it is built from:
 *   " Builds   : 120"                         how many zips the run plans
 *   " Restore  : 1   Clean : 1   Addon : 1   Upload : 1"
 *   " - arm64 sdk 36 : lite,core,..."         the plan, one line per target
 *   " - arm64 sdk 36 : lite [steps: upload]"  a target with its own addon/upload
 *                                             steps (a retry); "(none)" = no variant
 *   "=== [34/120] superlite arm64 sdk 36 ==="  a build starts (variant first)
 *   "- gapps source missing, restoring"        that build had to restore first
 *   "- build ok <V A S>" / "! build failed <V A S>"
 *   "! restore failed <V A S>"
 *   "=== addon arm64 sdk 35 ===" + "- addon ok <A S>" / "! addon failed <A S>"
 *   "--- Release arm64/36 to SourceForge ---" + "! zip upload failed <A/S>"
 *   "- nothing to upload <A/S> from <...>"     the target built nothing
 *   " Batch build done : 110 ok, 10 failed (of 120)"
 *
 * A successful upload prints no line of its own, so it is inferred: a release
 * section that ends without "! zip upload failed" uploaded the zips.
 */

export type StepState = "pending" | "running" | "restoring" | "ok" | "failed" | "skipped";

export type VariantStep = {
	variant: string;
	state: StepState;
	/** why it failed, short */
	note?: string;
	/** this build had to download its gapps source first */
	restored?: boolean;
};

export type TargetProgress = {
	arch: string;
	sdk: number;
	variants: VariantStep[];
	addon: StepState;
	upload: StepState;
	/** the zips are up, but the addon upload or the prune complained */
	uploadWarning?: string;
	/** the target named its own steps (a retry run), overriding the run's flags */
	steps?: { addon: boolean; upload: boolean };
};

export type BatchProgress = {
	total: number;
	ok: number;
	failed: number;
	/** finished builds, ok or failed */
	done: number;
	/** what is being built right now, e.g. "core arm64 sdk 35" */
	current: string;
	options: { restore: boolean; clean: boolean; addon: boolean; upload: boolean };
	targets: TargetProgress[];
	/** the script printed its closing summary */
	finished: boolean;
};

/** Lines worth keeping; everything else in a multi-megabyte log is noise. */
export const EVENT_LINE =
	/^(?: *Builds +:| *Restore +:| *- [a-z0-9_]+ sdk \d+ :|=== |--- Release |- build ok |! build failed |- addon ok |! addon failed |! restore failed |- gapps source missing|! gapps source missing|- nothing to upload |! zip upload failed |! addon upload failed |! addon api failed |! release api failed |! prune failed | *Batch build done )/;

/*
 * The outcome the script prints right after a build or addon step. A step
 * that dies mid-message (cp/mkdir out of disk space) leaves its last line
 * without a newline, and the marker lands at the end of it:
 *   "mkdir: cannot create directory '...! build failed <micro arm64 37> (0m15s)"
 * Without picking it out of there the build stays "running" in the table.
 */
const GLUED = /(?:- build ok |! build failed |! restore failed |- addon ok |! addon failed )<[^<>]+>.*$/;

export function eventLines(log: string): string {
	const out: string[] = [];
	for (const l of log.split("\n")) {
		if (EVENT_LINE.test(l)) {
			out.push(l);
			continue;
		}
		const m = l.match(GLUED);
		if (m) out.push(m[0]);
	}
	return out.join("\n");
}

const PLAN = /^ *- ([a-z0-9_]+) sdk (\d+) : (.*?)(?: \[steps: ([a-z,]+)\])?$/;
const BUILD = /^=== \[(\d+)\/(\d+)\] (\S+) (\S+) sdk (\d+) ===$/;
const ADDON = /^=== addon (\S+) sdk (\d+) ===$/;
const RELEASE = /^--- Release (\S+)\/(\d+) to SourceForge ---$/;
const DONE_SUM = /^ *Batch build done : (\d+) ok, (\d+) failed \(of (\d+)\)/;

export function parseBatchLog(log: string): BatchProgress {
	const targets: TargetProgress[] = [];
	const byKey = new Map<string, TargetProgress>();
	const options = { restore: false, clean: false, addon: false, upload: false };
	let total = 0;
	let current = "";
	let finished = false;
	let sumOk: number | null = null;
	let sumFailed: number | null = null;

	// The build the last "=== [n/m] ===" marker opened, and the target whose
	// release section is open; both end when the next section starts.
	let running: { t: TargetProgress; v: VariantStep } | null = null;
	let uploading: TargetProgress | null = null;

	const target = (arch: string, sdk: number) => byKey.get(`${arch}-${sdk}`);
	const closeUpload = () => {
		if (uploading && uploading.upload === "running") uploading.upload = "ok";
		uploading = null;
	};

	for (const line of log.split("\n")) {
		let m: RegExpMatchArray | null;

		if ((m = line.match(/^ *Builds +: (\d+)/))) {
			total = Number(m[1]);
			continue;
		}
		if ((m = line.match(/^ *Restore +: (\d).*Clean : (\d).*Addon : (\d).*Upload : (\d)/))) {
			options.restore = m[1] === "1";
			options.clean = m[2] === "1";
			options.addon = m[3] === "1";
			options.upload = m[4] === "1";
			continue;
		}
		if ((m = line.match(PLAN))) {
			const arch = m[1];
			const sdk = Number(m[2]);
			const list = m[3].trim();
			const steps = m[4]?.split(",");
			const t: TargetProgress = {
				arch,
				sdk,
				// "(skipped)", or "(none)" for a target that only runs its steps
				variants:
					list && !list.startsWith("(")
						? list.split(",").map((v) => ({ variant: v.trim(), state: "pending" as StepState }))
						: [],
				addon: "pending",
				upload: "pending",
				...(steps && { steps: { addon: steps.includes("addon"), upload: steps.includes("upload") } }),
			};
			targets.push(t);
			byKey.set(`${arch}-${sdk}`, t);
			continue;
		}

		if ((m = line.match(BUILD))) {
			closeUpload();
			total = Number(m[2]) || total;
			const [, , , variant, arch, sdk] = m;
			current = `${variant} ${arch} sdk ${sdk}`;
			const t = target(arch, Number(sdk));
			const v = t?.variants.find((x) => x.variant === variant);
			if (t && v) {
				v.state = "running";
				running = { t, v };
			} else {
				running = null;
			}
			continue;
		}
		if ((m = line.match(ADDON))) {
			closeUpload();
			running = null;
			const t = target(m[1], Number(m[2]));
			if (t) t.addon = "running";
			current = `addon ${m[1]} sdk ${m[2]}`;
			continue;
		}
		if ((m = line.match(RELEASE))) {
			// A retry that only uploads has release sections back to back.
			closeUpload();
			running = null;
			const t = target(m[1], Number(m[2]));
			if (t) {
				t.upload = "running";
				uploading = t;
			}
			current = `upload ${m[1]}/${m[2]}`;
			continue;
		}
		if (line.startsWith("=== ")) {
			// "=== <arch> sdk <sdk>: no variant selected - skipping ==="
			closeUpload();
			running = null;
			continue;
		}

		if (line.startsWith("- gapps source missing")) {
			if (running) {
				running.v.state = "restoring";
				running.v.restored = true;
			}
			continue;
		}
		if (line.startsWith("! gapps source missing")) {
			if (running) {
				running.v.state = "failed";
				running.v.note = "source tidak ada";
			}
			continue;
		}
		if ((m = line.match(/^! restore failed <(\S+) (\S+) (\d+)>/))) {
			const [, variant, arch, sdk] = m;
			const v = target(arch, Number(sdk))?.variants.find((x) => x.variant === variant);
			if (v) {
				v.state = "failed";
				v.note = "restore gagal";
			}
			continue;
		}
		if ((m = line.match(/^- build ok <(\S+) (\S+) (\d+)>/))) {
			const [, variant, arch, sdk] = m;
			const v = target(arch, Number(sdk))?.variants.find((x) => x.variant === variant);
			if (v) v.state = "ok";
			continue;
		}
		if ((m = line.match(/^! build failed <(\S+) (\S+) (\d+)>/))) {
			const [, variant, arch, sdk] = m;
			const v = target(arch, Number(sdk))?.variants.find((x) => x.variant === variant);
			if (v) {
				v.state = "failed";
				v.note = "build gagal";
			}
			continue;
		}

		if ((m = line.match(/^- addon ok <(\S+) (\d+)>/))) {
			const t = target(m[1], Number(m[2]));
			if (t) t.addon = "ok";
			continue;
		}
		if ((m = line.match(/^! addon failed <(\S+) (\d+)>/))) {
			const t = target(m[1], Number(m[2]));
			if (t) t.addon = "failed";
			continue;
		}

		if ((m = line.match(/^! zip upload failed <(\S+)\/(\d+)>/))) {
			const t = target(m[1], Number(m[2]));
			if (t) t.upload = "failed";
			if (uploading === t) uploading = null;
			continue;
		}
		// The zips are what matters; these only annotate the target.
		if ((m = line.match(/^! addon upload failed <(\S+)\/(\d+)>/))) {
			const t = target(m[1], Number(m[2]));
			if (t) t.uploadWarning = "upload addon gagal";
			continue;
		}
		if ((m = line.match(/^! addon api failed <(\S+)\/(\d+)>/))) {
			const t = target(m[1], Number(m[2]));
			if (t) t.uploadWarning = "JSON addon (File API) gagal diperbarui";
			continue;
		}
		if ((m = line.match(/^! release api failed <(\S+)\/(\d+)>/))) {
			const t = target(m[1], Number(m[2]));
			if (t) t.uploadWarning = "JSON rilis (File API) gagal diperbarui";
			continue;
		}
		if (line.startsWith("- nothing to upload ") && uploading) {
			uploading.uploadWarning = "tidak ada yang diunggah";
			continue;
		}
		if ((m = line.match(/^! prune failed <(\S+)\/(\d+)>/))) {
			const t = target(m[1], Number(m[2]));
			if (t) t.uploadWarning = "hapus rilis lama gagal";
			continue;
		}

		if ((m = line.match(DONE_SUM))) {
			closeUpload();
			running = null;
			sumOk = Number(m[1]);
			sumFailed = Number(m[2]);
			total = Number(m[3]) || total;
			finished = true;
			current = "";
			continue;
		}
	}

	// Anything never reached stays pending; an addon/upload that was switched
	// off is not pending at all.
	for (const t of targets) {
		if (!options.addon || (t.steps && !t.steps.addon)) t.addon = "skipped";
		if (!options.upload || (t.steps && !t.steps.upload)) t.upload = "skipped";
	}

	const ok = sumOk ?? count(targets, "ok");
	const failed = sumFailed ?? count(targets, "failed");
	if (!total) total = targets.reduce((n, t) => n + t.variants.length, 0);

	return { total, ok, failed, done: ok + failed, current, options, targets, finished };
}

function count(targets: TargetProgress[], state: StepState): number {
	let n = 0;
	for (const t of targets) for (const v of t.variants) if (v.state === state) n++;
	return n;
}

/*
 * What a finished run can retry: every failed variant, addon and zip upload,
 * and, for a run that never reached its closing summary (stopped, or the
 * panel went down), the builds and addons it did not get to. An upload left
 * pending is not listed on its own - it comes back with the target's builds
 * when the retry uploads - only one cut off mid-transfer is.
 *
 * Keys are what the retry form submits and the server action checks against
 * this same list: "v:<variant>:<arch>:<sdk>", "a:<arch>:<sdk>", "u:<arch>:<sdk>".
 */
export type RetryItem = {
	key: string;
	step: "variant" | "addon" | "upload";
	arch: string;
	sdk: number;
	variant?: string;
	/** why it is listed, short */
	why: string;
	/** not failed, just never finished */
	unfinished: boolean;
};

const UNFINISHED: StepState[] = ["pending", "running", "restoring"];

export function retryItems(p: BatchProgress): RetryItem[] {
	const cut = !p.finished;
	const out: RetryItem[] = [];
	for (const t of p.targets) {
		const at = { arch: t.arch, sdk: t.sdk };
		if (t.addon === "failed" || (cut && UNFINISHED.includes(t.addon))) {
			out.push({
				key: `a:${t.arch}:${t.sdk}`,
				step: "addon",
				...at,
				why: t.addon === "failed" ? "addon gagal dibuat" : "belum dikerjakan",
				unfinished: t.addon !== "failed",
			});
		}
		for (const v of t.variants) {
			if (v.state === "failed" || (cut && UNFINISHED.includes(v.state))) {
				out.push({
					key: `v:${v.variant}:${t.arch}:${t.sdk}`,
					step: "variant",
					...at,
					variant: v.variant,
					why: v.state === "failed" ? (v.note ?? "gagal") : "belum dikerjakan",
					unfinished: v.state !== "failed",
				});
			}
		}
		if (t.upload === "failed" || (cut && t.upload === "running")) {
			out.push({
				key: `u:${t.arch}:${t.sdk}`,
				step: "upload",
				...at,
				why: t.upload === "failed" ? "zip gagal diunggah" : "upload terputus",
				unfinished: t.upload !== "failed",
			});
		}
	}
	return out;
}
