"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "./Icon";
import type { MirrorProgress as Progress } from "@/lib/mirrorlog";

/*
 * Live view of a running mirror job: overall bytes/files, and every file in
 * flight with its percentage, speed and time left. Fed by
 * /api/jobs/<id>/mirror, which parses rclone's stats blocks from the log.
 * Each file is read from SourceForge and written to Drive in one stream, so
 * its speed is both the download and the upload rate.
 */

type Payload = { id: number; kind: string; status: string; progress: Progress };

export default function MirrorProgress() {
	const asked = Number(useSearchParams().get("job"));
	const [jobId, setJobId] = useState<number | null>(null);
	const [data, setData] = useState<Payload | null>(null);

	useEffect(() => {
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;
		async function tick() {
			try {
				const r = await fetch("/api/jobs/running", { cache: "no-store" });
				if (r.ok && alive) {
					const d: { id: number | null; kind: string | null } = await r.json();
					if (d.id && d.kind?.startsWith("mirror-")) setJobId(d.id);
					else if (asked > 0) setJobId(asked);
					else setJobId(null);
				}
			} catch {
				// keep the last state
			}
			if (alive) timer = setTimeout(tick, 5000);
		}
		tick();
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [asked]);

	useEffect(() => {
		if (!jobId) {
			setData(null);
			return;
		}
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;
		async function tick() {
			try {
				const r = await fetch(`/api/jobs/${jobId}/mirror`, { cache: "no-store" });
				if (r.ok && alive) {
					const d: Payload = await r.json();
					setData(d);
					if (d.status === "running") timer = setTimeout(tick, 3000);
					return;
				}
				if (alive) setData(null);
			} catch {
				// try again
			}
			if (alive) timer = setTimeout(tick, 8000);
		}
		tick();
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [jobId]);

	if (!data) return null;
	const p = data.progress;
	const running = data.status === "running";
	if (!running && !p.bytes && !p.copied.length) return null;

	return (
		<section className="card">
			<div className="card-head">
				<h2>
					<Icon name={running ? "sync" : "cloud_done"} />
					{running ? "Proses mirror" : "Proses mirror terakhir"} #{data.id}
				</h2>
				<code>SourceForge → Google Drive</code>
			</div>

			<div className="term-meta">
				{p.bytes && (
					<span className="pill run">
						<Icon name="speed" />
						{p.bytes.speed}
					</span>
				)}
				{p.bytes && (
					<span>
						<Icon name="data_usage" />
						{p.bytes.done} / {p.bytes.total}
					</span>
				)}
				{p.files && (
					<span>
						<Icon name="description" />
						{p.files.done}/{p.files.total} file
					</span>
				)}
				{running && p.bytes && (
					<span>
						<Icon name="timer" />
						sisa {p.bytes.eta}
					</span>
				)}
				{p.elapsed && (
					<span>
						<Icon name="schedule" />
						{p.elapsed}
					</span>
				)}
				{p.errors > 0 && (
					<span className="pill no">
						<Icon name="error" />
						{p.errors} error
					</span>
				)}
			</div>
			{p.bytes && (
				<div className={`meter ${running ? "run" : ""}`} style={{ margin: "0 16px" }}>
					<span style={{ width: `${p.bytes.pct}%` }} />
				</div>
			)}

			{running && p.transferring.length > 0 && (
				<div className="tscroll">
					<table className="jobs">
						<thead>
							<tr>
								<th>Sedang disalin</th>
								<th>Kemajuan</th>
								<th>Kecepatan</th>
								<th>Sisa</th>
							</tr>
						</thead>
						<tbody>
							{p.transferring.map((t) => (
								<tr key={t.path}>
									<td className="lbl">
										<code>{t.path}</code>
										<br />
										<small>{t.size}B</small>
									</td>
									<td style={{ minWidth: 120 }}>
										<div className="meter run">
											<span style={{ width: `${t.pct}%` }} />
										</div>
										<small>{t.pct}%</small>
									</td>
									<td>{t.speed.replace("i/s", "iB/s")}</td>
									<td>{t.eta}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{p.copied.length > 0 && (
				<p className="cl-hint">
					<b>{p.copied.length} file selesai disalin</b>
					{p.copied.length <= 12 ? `: ${p.copied.join(", ")}` : `, terakhir: ${p.copied.slice(-5).join(", ")}`}
				</p>
			)}
		</section>
	);
}
