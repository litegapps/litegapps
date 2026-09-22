"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "./Icon";
import type { BatchProgress as Progress, StepState } from "@/lib/batchlog";

/*
 * Progress table for a batch build, under the checklist that starts one.
 *
 * A full run takes hours, so "it is running" is not enough: this says which
 * targets are done, which failed, which are still queued, and how many builds
 * are left. Everything comes from /api/jobs/<id>/batch, which parses the job's
 * own log server-side - the script keeps no state, and a megabyte log must not
 * travel to the browser every few seconds.
 */

type Payload = {
	id: number;
	status: "running" | "done" | "failed" | "unknown" | "stopped";
	started_at: string | null;
	finished_at: string | null;
	progress: Progress;
};

const STEP: Record<StepState, { cls: string; icon: string; text: string }> = {
	pending: { cls: "", icon: "schedule", text: "menunggu" },
	running: { cls: "run", icon: "sync", text: "berjalan" },
	restoring: { cls: "run", icon: "cloud_download", text: "restore" },
	ok: { cls: "ok", icon: "check", text: "selesai" },
	failed: { cls: "no", icon: "close", text: "gagal" },
	skipped: { cls: "", icon: "remove", text: "tidak dipakai" },
};

function Step({ state, label, title }: { state: StepState; label: string; title?: string }) {
	const s = STEP[state];
	return (
		<span className={`pill ${s.cls}`} title={title ?? s.text}>
			<Icon name={s.icon} />
			{label}
		</span>
	);
}

/** Rough remaining time from the average so far; the per-build time varies a lot. */
function eta(startedAt: string | null, done: number, total: number): string {
	if (!startedAt || done < 2 || done >= total) return "—";
	const ms = Date.now() - new Date(startedAt).getTime();
	if (ms <= 0) return "—";
	const left = Math.round((ms / done) * (total - done) / 60000);
	if (left < 1) return "< 1 menit";
	const h = Math.floor(left / 60);
	return h ? `± ${h}j ${left % 60}m` : `± ${left}m`;
}

const OPEN_KEY = "lg.batchprogress.open";

export default function BatchProgress() {
	const asked = Number(useSearchParams().get("job"));
	const [jobId, setJobId] = useState<number | null>(null);
	const [data, setData] = useState<Payload | null>(null);
	// Collapsed or not, remembered per browser: the full table is 33 rows.
	const [open, setOpen] = useState(true);

	useEffect(() => {
		try {
			setOpen(localStorage.getItem(OPEN_KEY) !== "0");
		} catch {
			// private window or blocked storage: stay expanded
		}
	}, []);

	const toggle = () => {
		setOpen((v) => {
			try {
				localStorage.setItem(OPEN_KEY, v ? "0" : "1");
			} catch {
				// nothing to remember, the view still works
			}
			return !v;
		});
	};

	// Which batch job to show: the one in ?job=, else whatever runs now.
	useEffect(() => {
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;
		async function tick() {
			if (asked > 0) {
				if (alive) setJobId(asked);
				return;
			}
			try {
				const r = await fetch("/api/jobs/running", { cache: "no-store" });
				if (r.ok && alive) {
					const d: { id: number | null; kind: string | null } = await r.json();
					setJobId(d.id && d.kind === "build-batch" ? d.id : null);
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
				const r = await fetch(`/api/jobs/${jobId}/batch`, { cache: "no-store" });
				if (r.ok && alive) {
					const d: Payload = await r.json();
					setData(d);
					// Slow poll once it is over: the table stays as a report.
					timer = setTimeout(tick, d.status === "running" ? 5000 : 30000);
					return;
				}
				if (alive) setData(null);
			} catch {
				// network hiccup, try again
			}
			if (alive) timer = setTimeout(tick, 10000);
		}
		tick();
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [jobId]);

	if (!data || !data.progress.targets.length) return null;

	const p = data.progress;
	const left = Math.max(0, p.total - p.done);
	const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
	const running = data.status === "running";
	const doneTargets = p.targets.filter(
		(t) => t.variants.length > 0 && t.variants.every((v) => v.state === "ok" || v.state === "failed"),
	).length;

	// Everything that went wrong, in one place: a run of 120 builds must not
	// make the admin hunt for the red chips.
	const failures: { what: string; why: string }[] = [];
	for (const t of p.targets) {
		if (t.addon === "failed") failures.push({ what: `addon ${t.arch}/${t.sdk}`, why: "addon gagal dibuat" });
		for (const v of t.variants) {
			if (v.state === "failed") {
				failures.push({ what: `${v.variant} ${t.arch}/${t.sdk}`, why: v.note ?? "gagal" });
			}
		}
		if (t.upload === "failed") failures.push({ what: `upload ${t.arch}/${t.sdk}`, why: "zip gagal diunggah" });
		if (t.uploadWarning) failures.push({ what: `upload ${t.arch}/${t.sdk}`, why: t.uploadWarning });
	}

	return (
		<section className="card">
			<div className="card-head">
				<button className="headtoggle" type="button" onClick={toggle} aria-expanded={open}>
					<h2>
						<Icon name="table_rows" />
						Kemajuan build #{data.id}
						<Icon name={open ? "expand_less" : "expand_more"} />
					</h2>
				</button>
				<code>{running ? p.current || "menyiapkan…" : "selesai"}</code>
			</div>

			<div className="term-meta">
				<span className="pill ok">
					<Icon name="check" />
					{p.ok} selesai
				</span>
				<span className={`pill ${p.failed ? "no" : ""}`}>
					<Icon name="close" />
					{p.failed} gagal
				</span>
				<span className="pill">
					<Icon name="schedule" />
					sisa {left} zip
				</span>
				<span>
					<Icon name="inventory_2" />
					{doneTargets}/{p.targets.length} target
				</span>
				{running && (
					<span>
						<Icon name="timer" />
						perkiraan sisa {eta(data.started_at, p.done, p.total)}
					</span>
				)}
			</div>

			<div className={`meter ${running ? "run" : ""}`} style={{ margin: "0 16px" }}>
				<span style={{ width: `${pct}%` }} />
			</div>

			{open && failures.length > 0 && (
				<div className="note warn" style={{ margin: "12px 16px 0" }}>
					<Icon name="error" />
					<div>
						<b>{failures.length} gagal:</b>
						<ul className="faillist">
							{failures.map((f, i) => (
								<li key={`${f.what}-${i}`}>
									<code>{f.what}</code> — {f.why}
								</li>
							))}
						</ul>
						Target yang gagal tidak menghentikan sisanya. Bangun ulang hanya yang gagal lewat
						checklist di atas, atau lewat tab <b>Single</b>.
					</div>
				</div>
			)}

			{open && (
			<div className="tscroll">
				<table className="jobs">
					<thead>
						<tr>
							<th>Target</th>
							{p.options.addon && <th>Addon</th>}
							<th>Varian (restore + build)</th>
							{p.options.upload && <th>Upload SF</th>}
						</tr>
					</thead>
					<tbody>
						{p.targets.map((t) => {
							const okCount = t.variants.filter((v) => v.state === "ok").length;
							const badCount = t.variants.filter((v) => v.state === "failed").length;
							return (
								<tr key={`${t.arch}-${t.sdk}`}>
									<td>
										<b>{t.arch}</b> · SDK {t.sdk}
										<br />
										<small>
											{okCount}/{t.variants.length} zip jadi
											{badCount > 0 && `, ${badCount} gagal`}
										</small>
									</td>
									{p.options.addon && (
										<td>
											<Step state={t.addon} label={STEP[t.addon].text} />
										</td>
									)}
									<td>
										<div className="vchips">
											{t.variants.length === 0 ? (
												<span className="tag">tidak dibangun</span>
											) : (
												t.variants.map((v) => (
													<Step
														key={v.variant}
														state={v.state}
														label={v.variant}
														title={
															v.note
																? `${v.variant}: ${v.note}`
																: `${v.variant}: ${STEP[v.state].text}${
																		v.restored ? " (source diunduh dulu)" : ""
																	}`
														}
													/>
												))
											)}
										</div>
									</td>
									{p.options.upload && (
										<td>
											<Step
												state={t.upload}
												label={STEP[t.upload].text}
												title={t.uploadWarning ? `zip terunggah, tapi ${t.uploadWarning}` : undefined}
											/>
											{t.uploadWarning && (
												<>
													{" "}
													<span className="tag" title={t.uploadWarning}>
														!
													</span>
												</>
											)}
										</td>
									)}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			)}

			{!open && (
				<p className="cl-hint">
					Tabel disembunyikan{failures.length > 0 ? ` (${failures.length} gagal)` : ""} — klik judul
					di atas untuk membukanya lagi.
				</p>
			)}

			{open && (
			<p className="cl-hint">
				Dibaca dari log job itu sendiri. <b>Varian</b> hijau berarti zip-nya sudah jadi, biru sedang
				dikerjakan (<Icon name="cloud_download" /> berarti source-nya sedang diunduh), abu-abu belum
				digarap, merah gagal — arahkan kursor untuk melihat alasannya. <b>Upload SF</b> hijau berarti
				zip target itu sudah terkirim ke SourceForge. Perkiraan sisa waktu dihitung dari rata-rata
				sejauh ini, jadi kasar saja.
			</p>
			)}
		</section>
	);
}
