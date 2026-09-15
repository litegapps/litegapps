"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import type { Job } from "@/lib/targets";

const STATUS: Record<string, { cls: string; icon: string; text: string }> = {
	running: { cls: "run", icon: "sync", text: "berjalan" },
	done: { cls: "ok", icon: "check", text: "selesai" },
	failed: { cls: "no", icon: "close", text: "gagal" },
	unknown: { cls: "no", icon: "help", text: "tidak diketahui" },
};

function when(v: string | null) {
	if (!v) return "—";
	return String(v).replace("T", " ").replace(/\.\d+Z?$/, "").replace("Z", "");
}

function LogView({ id }: { id: number }) {
	const [log, setLog] = useState("Memuat…");
	const [status, setStatus] = useState<string>("running");
	const box = useRef<HTMLPreElement>(null);
	const stick = useRef(true);

	useEffect(() => {
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;

		async function tick() {
			try {
				const r = await fetch(`/api/jobs/${id}/log`, { cache: "no-store" });
				if (r.ok && alive) {
					const d = await r.json();
					setLog(d.log || "(belum ada keluaran)");
					setStatus(d.status);
					if (d.status === "running") timer = setTimeout(tick, 2000);
					return;
				}
			} catch {
				// Network hiccup: keep polling rather than dropping the view.
			}
			if (alive) timer = setTimeout(tick, 5000);
		}
		tick();
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [id]);

	// Follow the tail only while the reader has not scrolled up.
	useEffect(() => {
		const el = box.current;
		if (el && stick.current) el.scrollTop = el.scrollHeight;
	}, [log]);

	return (
		<pre
			className="logbox"
			ref={box}
			onScroll={(e) => {
				const el = e.currentTarget;
				stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
			}}
		>
			{log}
			{status === "running" ? "\n…" : ""}
		</pre>
	);
}

export default function Jobs({ jobs, busy }: { jobs: Job[]; busy: boolean }) {
	const [open, setOpen] = useState<number | null>(
		jobs.find((j) => j.status === "running")?.id ?? null,
	);
	const router = useRouter();

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
				Belum ada job yang dijalankan.
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
											className="joblink"
											type="button"
											onClick={() => setOpen(open === j.id ? null : j.id)}
										>
											{open === j.id ? "tutup" : "lihat"}
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{open !== null && <LogView id={open} />}
		</>
	);
}
