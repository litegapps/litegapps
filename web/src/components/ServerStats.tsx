"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { SysInfo } from "@/lib/sysinfo";

function bytes(n: number): string {
	if (!n) return "0 B";
	const u = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
	return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

function duration(sec: number): string {
	const d = Math.floor(sec / 86400);
	const h = Math.floor((sec % 86400) / 3600);
	const m = Math.floor((sec % 3600) / 60);
	if (d) return `${d} hari ${h} jam`;
	if (h) return `${h} jam ${m} menit`;
	return `${m} menit`;
}

function Meter({ pct }: { pct: number }) {
	const p = Math.max(0, Math.min(100, pct));
	// Colour shifts before the resource actually runs out, not after.
	const tone = p >= 90 ? "no" : p >= 75 ? "run" : "ok";
	return (
		<div className={`meter ${tone}`} role="meter" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
			<span style={{ width: `${p}%` }} />
		</div>
	);
}

function Card({ icon, title, value, sub, pct }: {
	icon: string;
	title: string;
	value: string;
	sub?: string;
	pct?: number;
}) {
	return (
		<div className="stat sys">
			<div className="k">
				<Icon name={icon} />
				{title}
			</div>
			<div className="v">{value}</div>
			{pct !== undefined && <Meter pct={pct} />}
			{sub && <div className="sub">{sub}</div>}
		</div>
	);
}

export default function ServerStats({ initial }: { initial: SysInfo }) {
	const [s, setS] = useState(initial);
	const [stale, setStale] = useState(false);

	useEffect(() => {
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;
		async function tick() {
			try {
				const r = await fetch("/api/server", { cache: "no-store" });
				if (r.status === 401) {
					window.location.href = "/login";
					return;
				}
				if (r.ok && alive) {
					setS(await r.json());
					setStale(false);
				}
			} catch {
				if (alive) setStale(true);
			}
			if (alive) timer = setTimeout(tick, 5000);
		}
		timer = setTimeout(tick, 5000);
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, []);

	const memPct = s.memory.total ? (s.memory.used / s.memory.total) * 100 : 0;
	const swapPct = s.swap.total ? (s.swap.used / s.swap.total) * 100 : 0;
	const diskPct = s.disk && s.disk.total ? (s.disk.used / s.disk.total) * 100 : 0;
	// Load average only means something relative to the core count.
	const loadPct = s.cpu.cores ? (s.cpu.load[0] / s.cpu.cores) * 100 : 0;

	return (
		<>
			<div className="stats sysgrid">
				<Card
					icon="memory"
					title="CPU"
					value={`${s.cpu.usage.toFixed(0)}%`}
					pct={s.cpu.usage}
					sub={`${s.cpu.cores} core`}
				/>
				<Card
					icon="speed"
					title="Load"
					value={s.cpu.load[0].toFixed(2)}
					pct={loadPct}
					sub={`5 mnt ${s.cpu.load[1].toFixed(2)} · 15 mnt ${s.cpu.load[2].toFixed(2)}`}
				/>
				<Card
					icon="memory_alt"
					title="RAM"
					value={`${memPct.toFixed(0)}%`}
					pct={memPct}
					sub={`${bytes(s.memory.used)} / ${bytes(s.memory.total)} · sisa ${bytes(s.memory.available)}`}
				/>
				<Card
					icon="hard_drive"
					title="Disk repo"
					value={s.disk ? `${diskPct.toFixed(0)}%` : "—"}
					pct={s.disk ? diskPct : undefined}
					sub={s.disk ? `sisa ${bytes(s.disk.free)} dari ${bytes(s.disk.total)}` : "tidak terbaca"}
				/>
				<Card
					icon="swap_horiz"
					title="Swap"
					value={s.swap.total ? `${swapPct.toFixed(0)}%` : "—"}
					pct={s.swap.total ? swapPct : undefined}
					sub={s.swap.total ? `${bytes(s.swap.used)} / ${bytes(s.swap.total)}` : "tidak ada swap"}
				/>
				<Card icon="schedule" title="Uptime" value={duration(s.host.uptime)} sub="sejak VPS terakhir boot" />
			</div>

			<section className="card">
				<div className="card-head">
					<h2>
						<Icon name="dns" />
						Info VPS
					</h2>
				</div>
				<div className="tscroll">
					<table className="kv">
						<tbody>
							<tr><th>Hostname</th><td>{s.host.hostname}</td></tr>
							<tr><th>Sistem operasi</th><td>{s.host.os}</td></tr>
							<tr><th>Kernel</th><td>{s.host.kernel}</td></tr>
							<tr><th>Arsitektur</th><td>{s.host.arch}</td></tr>
							<tr><th>Prosesor</th><td>{s.cpu.model}</td></tr>
							<tr><th>Jumlah core</th><td>{s.cpu.cores}</td></tr>
							<tr><th>RAM total</th><td>{bytes(s.memory.total)}</td></tr>
							<tr><th>Disk repo</th><td>{s.disk ? `${bytes(s.disk.total)} (${s.disk.path})` : "—"}</td></tr>
							<tr><th>Uptime VPS</th><td>{duration(s.host.uptime)}</td></tr>
						</tbody>
					</table>
				</div>
			</section>

			<section className="card">
				<div className="card-head">
					<h2>
						<Icon name="deployed_code" />
						Panel
					</h2>
				</div>
				<div className="tscroll">
					<table className="kv">
						<tbody>
							<tr><th>Node.js</th><td>{s.panel.node}</td></tr>
							<tr><th>Panel berjalan</th><td>{duration(s.panel.uptime)}</td></tr>
						</tbody>
					</table>
				</div>
			</section>

			<footer>
				<span className="item">
					<Icon name={stale ? "cloud_off" : "update"} />
					<span>
						{stale ? "Gagal memperbarui — menampilkan data terakhir, " : "Diperbarui otomatis tiap 5 detik, terakhir "}
						<b>{new Date(s.sampled_at).toLocaleTimeString("id-ID")}</b>
					</span>
				</span>
			</footer>
		</>
	);
}
