import { redirect } from "next/navigation";
import Icon from "@/components/Icon";
import AppBar from "@/components/AppBar";
import BuildForm from "@/components/BuildForm";
import Jobs from "@/components/Jobs";
import StatusMatrix from "@/components/StatusMatrix";
import { currentUser } from "@/lib/session";
import { listJobs, runningJob } from "@/lib/jobs";
import { readStatus, type Status } from "@/lib/status";

// Sessions, job rows and status.json all change outside the render, so this
// page must never be cached.
export const dynamic = "force-dynamic";

function Stat({ icon, label, value, total }: {
	icon: string;
	label: string;
	value: string | number;
	total?: number;
}) {
	return (
		<div className="stat">
			<div className="k">
				<Icon name={icon} />
				{label}
			</div>
			<div className="v">
				{value}
				{total !== undefined && <small> / {total}</small>}
			</div>
		</div>
	);
}

function count(s: Status, key: "gapps" | "package") {
	let n = 0;
	let total = 0;
	for (const a of s.archs) {
		for (const sdk of s.sdks) {
			total++;
			if (s.targets[a]?.[String(sdk.sdk)]?.[key]) n++;
		}
	}
	return { n, total };
}

export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const { error } = await searchParams;
	const [status, jobs, running] = await Promise.all([readStatus(), listJobs(), runningJob()]);
	const busy = running !== null;

	const g = status ? count(status, "gapps") : null;
	const p = status ? count(status, "package") : null;

	return (
		<>
			<AppBar user={user} />

			<div className="wrap">
				{error && (
					<div className="err" style={{ marginTop: 20 }}>
						<Icon name="error" />
						<span>{error}</span>
					</div>
				)}

				<div className="hero" style={{ paddingBlock: "28px 8px" }}>
					<h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
						Panel Build
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						Masuk sebagai <b>{user}</b>. Semua perintah dijalankan di VPS ini.
					</p>
					{status?.version?.version && (
						<span className="vbadge">
							<Icon name="sell" />
							{/* Separate items so the flex gap spaces them: Plus Jakarta
							    Sans draws a space only ~2px wide at this size, which
							    read as "LiteGapps4.9". */}
							<span>LiteGapps</span>
							<span>{status.version.version}</span>
							<span className="sub">
								build {status.version.code} &middot; {status.version.codename}
							</span>
						</span>
					)}
				</div>

				<div className="stats">
					<Stat icon="sell" label="Versi" value={status?.version?.version ?? "—"} />
					<Stat icon="event" label="Rilis terakhir" value={status?.latest_release || "—"} />
					{g && <Stat icon="folder_zip" label="Gapps source" value={g.n} total={g.total} />}
					{p && <Stat icon="inventory_2" label="Package source" value={p.n} total={p.total} />}
				</div>

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="play_circle" />
							Jalankan
						</h2>
						<code>build.sh &middot; packages/make &middot; web/make-status.sh</code>
					</div>
					<BuildForm busy={busy} />
					{busy && running && (
						<div className="legend">
							<span className="item">
								<Icon name="sync" />
								<span>
									Sedang berjalan: <b>{running.label}</b>. Satu job pada satu waktu, karena
									semuanya memakai <code>output/</code> dan <code>log/</code> yang sama.
								</span>
							</span>
						</div>
					)}
				</section>

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="history" />
							Riwayat job
						</h2>
					</div>
					<Jobs jobs={jobs} busy={busy} />
				</section>

				{status ? (
					<StatusMatrix status={status} />
				) : (
					<section className="card">
						<div className="msg">
							<Icon name="error" />
							<b>status.json belum ada.</b>
							<br />
							Jalankan perintah <code>Segarkan status</code> di atas.
						</div>
					</section>
				)}

				<footer>
					<span className="item">
						<Icon name="update" />
						<span>
							Status diperbarui <b>{status?.generated ?? "—"}</b>
						</span>
					</span>
				</footer>
			</div>
		</>
	);
}
