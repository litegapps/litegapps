import { runningJob, startJob } from "./jobs";
import {
	AUTO_BACKUP_HOUR,
	AUTO_BACKUP_LAST,
	autoBackupOn,
	getSetting,
	setSetting,
	today,
} from "./settings";

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

	console.log(`[scheduler] daily backup check every ${EVERY_MS / 60000} min`);
}

async function tick(): Promise<void> {
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
