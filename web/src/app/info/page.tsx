import { redirect } from "next/navigation";
import AppBar from "@/components/AppBar";
import Icon from "@/components/Icon";
import StatusMatrix from "@/components/StatusMatrix";
import JobTerminal from "@/components/JobTerminal";
import { RunButton } from "@/components/RestoreControls";
import { startJobAction } from "@/app/actions";
import { currentUser } from "@/lib/session";
import { runningJob } from "@/lib/jobs";
import { readStatus, type Status } from "@/lib/status";
import { targetSupported } from "@/lib/targets";

// status.json is rewritten by a job, so this page must never be cached.
export const dynamic = "force-dynamic";
export const metadata = { title: "Info — LiteGapps" };

function Stat({
	icon,
	label,
	value,
	total,
}: {
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
			// A dropped target never gets sources, so it is not "missing" either.
			if (!targetSupported(a, sdk.sdk)) continue;
			total++;
			if (s.targets[a]?.[String(sdk.sdk)]?.[key]) n++;
		}
	}
	return { n, total };
}

export default async function InfoPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const { error } = await searchParams;
	const [status, running] = await Promise.all([readStatus(), runningJob()]);
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
						Info
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						Apa yang sudah ada di server rilis: source gapps, source package, dan rilis yang sudah
						terbit.
					</p>
					{status?.version?.version && (
						<span className="vbadge">
							<Icon name="sell" />
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
							<Icon name="sync" />
							Segarkan data
						</h2>
						<code>bash web/make-status.sh</code>
					</div>
					<div className="actions">
						<form action={startJobAction}>
							<input type="hidden" name="kind" value="status" />
							<input type="hidden" name="back" value="/info" />
							<RunButton busy={busy} icon="sync" label="Segarkan status" />
						</form>
					</div>
					<div className="legend">
						<span className="item">
							<Icon name="update" />
							<span>
								Data dibaca dari <code>web/status.json</code>, hasil pembacaan daftar file di
								SourceForge. Terakhir diperbarui <b>{status?.generated ?? "—"}</b>.
							</span>
						</span>
					</div>
				</section>

				<JobTerminal kinds={["status"]} />

				{status ? (
					<StatusMatrix status={status} />
				) : (
					<section className="card">
						<div className="msg">
							<Icon name="error" />
							<b>status.json belum ada.</b>
							<br />
							Jalankan <code>Segarkan status</code> di atas.
						</div>
					</section>
				)}
			</div>
		</>
	);
}
