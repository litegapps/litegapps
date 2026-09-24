import { runningJob, startJob } from "./jobs";
import {
	ADDONAPI_LAST,
	RELEASEAPI_LAST,
	AUTO_BACKUP_HOUR,
	AUTO_BACKUP_LAST,
	AUTOBUILD_LAST,
	autoBackupOn,
	getSetting,
	month,
	readAddonApiAuto,
	readAutoBuild,
	readRetention,
	readSource,
	setSetting,
	today,
} from "./settings";
import { readOverrides } from "./buildtargets";
import { readPackageLists } from "./packages";
import { readPanelConfig } from "./panelconfig";
import { readAutoPrefs } from "./formstate";
import { targetSupported } from "./targets";
import { readAddonIndex, readReleaseIndex } from "./addonapi";

/*
 * Daily database backup.
 *
 * Started once per server process from instrumentation.ts. There is no cron
 * in the image and no second process to run one, so the panel ticks on its
 * own: every few minutes it asks whether today's backup has already been
 * started, and if not - and the hour has come - it queues the same job the
 * Backup page's button queues.
 *
 * The "already done" mark is a date in the settings table, not a timer, so a
 * container restart cannot cause a second backup on the same day, and a day
 * the VPS was off simply has no backup rather than a burst afterwards.
 */

const EVERY_MS = 5 * 60 * 1000;

let started = false;

export function startScheduler(): void {
	if (started) return;
	started = true;

	const timer = setInterval(() => {
		tick().catch((e) => console.error("[scheduler] tick failed:", e));
	}, EVERY_MS);
	// Never hold the process open for the sake of the timer.
	timer.unref?.();

	// First check shortly after boot, in case the VPS was off at the set hour.
	setTimeout(() => {
		tick().catch((e) => console.error("[scheduler] first tick failed:", e));
	}, 30_000).unref?.();

	console.log(`[scheduler] daily backup, monthly build and File API check every ${EVERY_MS / 60000} min`);
}

async function tick(): Promise<void> {
	await backupTick();
	await buildTick();
	await addonApiTick();
}

/*
 * File API: rebuild the public addon JSON (with the README lists on
 * SourceForge) and the release JSON every few days (File API page, default
 * 4). Each is counted from its own last full run, whoever started it; with no
 * run recorded yet, from when its index.json was last written, so switching
 * it on does not fire at once after a fresh run. One job per tick: when both
 * are due, the release index follows at the next free tick. Runs after the
 * build check, so a due monthly build takes the slot first.
 */
async function addonApiTick(): Promise<void> {
	const cfg = await readAddonApiAuto();
	if (!cfg.on) return;

	const due = (last: string) => {
		const ms = Date.parse(last);
		return !Number.isFinite(ms) || Date.now() - ms >= cfg.days * 86_400_000;
	};
	const jobs = [
		{
			kind: "addon-api" as const,
			key: ADDONAPI_LAST,
			last: cfg.last || (await readAddonIndex())?.generated || "",
		},
		{
			kind: "release-api" as const,
			key: RELEASEAPI_LAST,
			last: cfg.releaseLast || (await readReleaseIndex())?.generated || "",
		},
	];
	const next = jobs.find((j) => due(j.last));
	if (!next) return;

	if (await runningJob()) return;
	try {
		const id = await startJob({ kind: next.kind });
		await setSetting(next.key, new Date().toISOString());
		console.log(`[scheduler] File API ${next.kind} started as job ${id} (every ${cfg.days} days)`);
	} catch (e) {
		console.error(`[scheduler] File API ${next.kind} could not start:`, e instanceof Error ? e.message : e);
	}
}

/*
 * Monthly auto build: what Build > Auto has ticked, once per calendar month,
 * from the set day and hour on. "From" rather than "at": if the VPS was off
 * or another job held the slot, it starts at the next tick that is free, but
 * never twice in one month (AUTOBUILD_LAST). It is the same request the Multi
 * button sends: the Auto tab's ticked targets and options, variants from
 * Config target, package lists, identity, retention and the restore source
 * (Google Drive when that is switched on) from Build > Settings.
 */
async function buildTick(): Promise<void> {
	const cfg = await readAutoBuild();
	if (!cfg.on) return;

	const now = new Date();
	const thisMonth = month(now);
	if (cfg.last === thisMonth) return;
	if (now.getDate() < cfg.day || (now.getDate() === cfg.day && now.getHours() < cfg.hour)) return;

	// One job at a time: wait for the running one, try again next tick.
	if (await runningJob()) return;

	// Exactly what the Build > Auto checklist has ticked (targets and options),
	// saved as the form changes - its own list, not Multi's; variants come
	// from Config target, source and retention from Build > Settings.
	const prefs = await readAutoPrefs();
	const targets = prefs.targets.filter((k) => {
		const i = k.lastIndexOf("-");
		return targetSupported(k.slice(0, i), Number(k.slice(i + 1)));
	});
	if (!targets.length) {
		await setSetting(AUTOBUILD_LAST, thisMonth);
		console.log(`[scheduler] monthly auto build ${thisMonth} skipped: no target ticked in Build > Auto`);
		return;
	}
	try {
		const id = await startJob({
			kind: "build-batch",
			auto: true,
			targets,
			overrides: await readOverrides(),
			packages: await readPackageLists(),
			config: await readPanelConfig(),
			retention: await readRetention(),
			source: await readSource(),
			restoreMissing: prefs.restoreMissing,
			cleanAfter: prefs.cleanAfter,
			buildAddon: prefs.buildAddon,
			upload: prefs.upload,
		});
		// Marked only once the job really started, so a refused start (a build
		// run outside the panel, say) is retried rather than skipped a month.
		await setSetting(AUTOBUILD_LAST, thisMonth);
		console.log(`[scheduler] monthly auto build ${thisMonth} started as job ${id} (${targets.length} targets)`);
	} catch (e) {
		console.error("[scheduler] monthly auto build could not start:", e instanceof Error ? e.message : e);
	}
}

async function backupTick(): Promise<void> {
	if (!(await autoBackupOn())) return;

	const day = today();
	if ((await getSetting(AUTO_BACKUP_LAST)) === day) return;
	if (new Date().getHours() < AUTO_BACKUP_HOUR) return;

	// Builds and backups share the single job slot; try again next tick.
	if (await runningJob()) return;

	// Marked before starting: a failed backup is reported in the job history
	// and retried tomorrow, rather than every five minutes for a whole day.
	await setSetting(AUTO_BACKUP_LAST, day);
	const id = await startJob({ kind: "db-backup" });
	console.log(`[scheduler] daily backup started as job ${id}`);
}
