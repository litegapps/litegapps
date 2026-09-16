/*
 * Runs once per server process (Next.js instrumentation hook). Used to start
 * the daily backup scheduler - see src/lib/scheduler.ts.
 */
export async function register() {
	// Skip the edge runtime: node:child_process and mysql2 only exist here.
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { startScheduler } = await import("./lib/scheduler");
	startScheduler();
}
