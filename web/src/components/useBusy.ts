"use client";

import { useEffect, useState } from "react";

/*
 * Is a job running right now?
 *
 * Pages pass what was true when they rendered; this keeps it current, so a
 * build started somewhere else (another tab, or the same tab minutes ago)
 * disables the buttons here too instead of letting a click fail server-side.
 */
export function useBusy(initial: boolean): boolean {
	const [busy, setBusy] = useState(initial);

	useEffect(() => {
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;

		async function tick() {
			try {
				const r = await fetch("/api/jobs/running", { cache: "no-store" });
				if (r.ok && alive) {
					const d: { id: number | null } = await r.json();
					setBusy(d.id !== null);
				}
			} catch {
				// Keep the last known state rather than guessing.
			}
			if (alive) timer = setTimeout(tick, 4000);
		}
		tick();
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, []);

	return busy;
}
