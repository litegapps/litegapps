"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

/*
 * Live terminal for one job, shown inline under the form that started it.
 *
 * Every job the panel starts is a shell script, and the only honest progress
 * report is its own output - so this shows the real stdout/stderr tail rather
 * than a spinner. The step line above it is parsed from the markers
 * build-batch.sh prints ("=== [2/7] core arm64 sdk 36 ==="), which is how it
 * can say which build is running without the runner tracking any state.
 */

type JobLog = {
	id: number;
	kind: string;
	label: string;
	status: "running" | "done" | "failed" | "unknown";
	exit_code: number | null;
	started_at: string | null;
	finished_at: string | null;
	log: string;
};

const STATUS: Record<string, { cls: string; icon: string; text: string }> = {
	running: { cls: "run", icon: "sync", text: "berjalan" },
	done: { cls: "ok", icon: "check", text: "selesai" },
	failed: { cls: "no", icon: "close", text: "gagal" },
	unknown: { cls: "no", icon: "help", text: "tidak diketahui" },
};

/** Progress and the current step, read from the log the scripts already print. */
function progressOf(log: string): { step: string; done: number; total: number } {
	let step = "";
	let done = 0;
	let total = 0;

	const re = /^=== \[(\d+)\/(\d+)\] (.+) ===$/gm;
	let m: RegExpExecArray | null;
	while ((m = re.exec(log))) {
		done = Number(m[1]);
		total = Number(m[2]);
		step = m[3];
	}
	if (!step) {
		// Other jobs mark their phase with a plain "=== ... ===" or "--- ... ---"
		const plain = [...log.matchAll(/^(?:===|---) (.+?) (?:===|---)$/gm)];
		const last = plain[plain.length - 1]?.[1] ?? "";
		if (last && !/^=+$/.test(last)) step = last;
	}

	// Lines the build prints while working on one variant, more useful than the
	// step header once a target is running for minutes.
	const tail = log.trimEnd().split("\n").slice(-40).reverse();
	const detail = tail.find((l) => /^(- |! |\s*\d+\. )/.test(l.trim()) && l.trim().length > 3);
	if (detail) step = step ? `${step} — ${detail.trim().slice(0, 90)}` : detail.trim().slice(0, 90);

	return { step, done, total };
}

function elapsed(from: string | null, to: string | null): string {
	if (!from) return "—";
	const start = new Date(from).getTime();
	const end = to ? new Date(to).getTime() : Date.now();
	const s = Math.max(0, Math.round((end - start) / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return h ? `${h}j ${m}m` : m ? `${m}m ${s % 60}d` : `${s}d`;
}

export default function Terminal({
	jobId,
	onClose,
}: {
	jobId: number;
	/** clears the view; the panel itself stays on the page */
	onClose?: () => void;
}) {
	const [job, setJob] = useState<JobLog | null>(null);
	const [follow, setFollow] = useState(true);
	const [copied, setCopied] = useState(false);
	const box = useRef<HTMLPreElement>(null);

	// Poll while it runs, then once more after it ends so the last lines land.
	useEffect(() => {
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;

		async function tick() {
			try {
				const r = await fetch(`/api/jobs/${jobId}/log`, { cache: "no-store" });
				if (r.ok && alive) {
					const d: JobLog = await r.json();
					setJob(d);
					if (d.status === "running") timer = setTimeout(tick, 1500);
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
	}, [jobId]);

	useEffect(() => {
		const el = box.current;
		if (el && follow) el.scrollTop = el.scrollHeight;
	}, [job?.log, follow]);

	const s = STATUS[job?.status ?? "running"] ?? STATUS.running;
	const p = progressOf(job?.log ?? "");
	const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;

	return (
		<section className="card term" aria-label="Log proses">
			<div className="modal-head">
				<h3>
					<Icon name="terminal" />
					{job?.label ?? `Job #${jobId}`}
				</h3>
				{onClose && (
					<button className="icon-btn" type="button" onClick={onClose} aria-label="Tutup log">
						<Icon name="close" />
					</button>
				)}
			</div>

			<div className="term-meta">
				<span className={`pill ${s.cls}`}>
					<Icon name={s.icon} />
					{s.text}
					{job?.status === "failed" && job.exit_code !== null ? ` (${job.exit_code})` : ""}
				</span>
				<span>#{jobId}</span>
				<span>{job?.kind}</span>
				<span>
					<Icon name="timer" />
					{elapsed(job?.started_at ?? null, job?.finished_at ?? null)}
				</span>
				{p.total > 0 && (
					<span>
						<Icon name="checklist" />
						{p.done}/{p.total}
					</span>
				)}
			</div>

			{p.total > 0 && (
				<div className="meter run" style={{ margin: "0 16px" }}>
					<span style={{ width: `${pct}%` }} />
				</div>
			)}

			{p.step && <div className="term-step">{p.step}</div>}

			<pre
				className="logbox term-body"
				ref={box}
				onScroll={(e) => {
					const el = e.currentTarget;
					setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
				}}
			>
				{job?.log || "(menunggu keluaran…)"}
				{job?.status === "running" ? "\n▌" : ""}
			</pre>

			<div className="term-foot">
				<label className="cl-switch">
					<input type="checkbox" checked={follow} onChange={() => setFollow(!follow)} />
					<span>Ikuti baris terakhir</span>
				</label>
				<button
					type="button"
					className="btn tonal"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(job?.log ?? "");
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						} catch {
							setCopied(false);
						}
					}}
				>
					<Icon name={copied ? "check" : "content_copy"} />
					{copied ? "Tersalin" : "Salin log"}
				</button>
				<button type="button" className="btn" onClick={onClose}>
					<Icon name="close" />
					Tutup
				</button>
			</div>
		</section>
	);
}
