"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import Icon from "./Icon";
import type { Job } from "@/lib/targets";

const STATUS: Record<string, { cls: string; icon: string; text: string }> = {
	running: { cls: "run", icon: "sync", text: "berjalan" },
	done: { cls: "ok", icon: "check", text: "selesai" },
	failed: { cls: "no", icon: "close", text: "gagal" },
	unknown: { cls: "no", icon: "help", text: "tidak diketahui" },
};

// mysql2 hands DATETIME columns over as Date objects, which reach this client
// component still as Dates; String() on one gives "Tue Sep 15 …", so format
// from the ISO form instead (the database clock is UTC).
function when(v: string | Date | null) {
	if (!v) return "—";
	const d = new Date(v);
	if (Number.isNaN(d.getTime())) return String(v);
	return d.toISOString().slice(0, 19).replace("T", " ");
}

export default function Jobs({ jobs, busy }: { jobs: Job[]; busy: boolean }) {
	// The log itself lives in the terminal panel on the page; opening one from
	// here just points that panel at this job.
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = Number(params.get("job")) || null;

	// While something is running the row status is stale the moment it is
	// rendered, so refresh the server component on a slow interval.
	useEffect(() => {
		if (!busy) return;
		const t = setInterval(() => router.refresh(), 5000);
		return () => clearInterval(t);
	}, [busy, router]);

	if (jobs.length === 0) {
		return (
			<div className="msg">
				<Icon name="history" />
				Belum ada job dari halaman ini.
			</div>
		);
	}

	return (
		<>
			<div className="tscroll">
				<table className="jobs">
					<thead>
						<tr>
							<th>#</th>
							<th>Perintah</th>
							<th>Status</th>
							<th>Mulai</th>
							<th>Selesai</th>
							<th>Log</th>
						</tr>
					</thead>
					<tbody>
						{jobs.map((j) => {
							const s = STATUS[j.status] ?? STATUS.failed;
							return (
								<tr key={j.id}>
									<td>{j.id}</td>
									<td className="lbl">{j.label}</td>
									<td>
										<span className={`pill ${s.cls}`}>
											<Icon name={s.icon} />
											{s.text}
											{j.status === "failed" && j.exit_code !== null ? ` (${j.exit_code})` : ""}
										</span>
									</td>
									<td className="when">{when(j.started_at)}</td>
									<td className="when">{when(j.finished_at)}</td>
									<td>
										<button
											className={`joblink${open === j.id ? " on" : ""}`}
											type="button"
											onClick={() => {
												const next = new URLSearchParams(params.toString());
												next.set("job", String(j.id));
												router.replace(`${pathname}?${next}`);
											}}
											title="Tampilkan log job ini"
										>
											<Icon name="terminal" />
											log
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</>
	);
}
