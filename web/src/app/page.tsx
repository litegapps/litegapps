import { redirect } from "next/navigation";
import Icon from "@/components/Icon";
import AppBar from "@/components/AppBar";
import BuildForm from "@/components/BuildForm";
import BatchBuildForm from "@/components/BatchBuildForm";
import Jobs from "@/components/Jobs";
import { currentUser } from "@/lib/session";
import { listJobs, runningJob } from "@/lib/jobs";
import { readStatus } from "@/lib/status";
import { readRestoreOverview } from "@/lib/restore";
import { readOverrides } from "@/lib/buildtargets";
import { PACKAGE_LISTS, readPackageLists, resolveList } from "@/lib/packages";
import { readBatchPrefs, readSinglePrefs } from "@/lib/formstate";
import TargetConfigForm from "@/components/TargetConfigForm";
import PackageListsForm from "@/components/PackageListsForm";
import JobTerminal from "@/components/JobTerminal";
import Link from "next/link";

// Sessions, job rows and status.json all change outside the render, so this
// page must never be cached.
export const dynamic = "force-dynamic";

export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; done?: string; tab?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const { error, done, tab: rawTab } = await searchParams;
	const tab = rawTab === "config" ? "config" : rawTab === "single" ? "single" : "build";
	const [status, jobs, running, overview, overrides] = await Promise.all([
		readStatus(),
		listJobs(),
		runningJob(),
		readRestoreOverview(),
		readOverrides(),
	]);
	const [batchPrefs, singlePrefs] = await Promise.all([readBatchPrefs(), readSinglePrefs()]);
	const storedPackages = tab === "config" ? await readPackageLists() : {};
	const packageLists = Object.fromEntries(
		PACKAGE_LISTS.map((n) => [n, resolveList(n, storedPackages)]),
	);
	const busy = running !== null;

	// Source state for the checklist: what the release server has, and what
	// this checkout already holds.
	const serverGapps: Record<string, boolean> = {};
	for (const a of status?.archs ?? []) {
		for (const s of status?.sdks ?? []) {
			serverGapps[`${a}-${s.sdk}`] = Boolean(status?.targets[a]?.[String(s.sdk)]?.gapps);
		}
	}
	const localGapps: Record<string, string[]> = {};
	for (const r of overview.restored) localGapps[`${r.arch}-${r.sdk}`] = r.variants;

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
				{done && (
					<div className="err ok" style={{ marginTop: 20 }}>
						<Icon name="check_circle" />
						<span>{done}</span>
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

				<nav className="tabs card" aria-label="Halaman build" style={{ marginBottom: 0 }}>
					<Link href="/" className={`tab${tab === "build" ? " active" : ""}`}>
						<Icon name="checklist" />
						<span>Build banyak</span>
					</Link>
					<Link href="/?tab=single" className={`tab${tab === "single" ? " active" : ""}`}>
						<Icon name="play_circle" />
						<span>Satu perintah</span>
					</Link>
					<Link href="/?tab=config" className={`tab${tab === "config" ? " active" : ""}`}>
						<Icon name="tune" />
						<span>Config target</span>
					</Link>
				</nav>

				{tab === "single" ? (
					<>
				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="play_circle" />
							Jalankan satu perintah
						</h2>
						<code>build.sh &middot; packages/make &middot; web/make-status.sh</code>
					</div>
					<BuildForm busy={busy} back="/?tab=single" prefs={singlePrefs} />
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

				<JobTerminal kinds={["make", "packages", "restore", "clean", "status"]} />

					<section className="card">
						<div className="card-head">
							<h2>
								<Icon name="history" />
								Riwayat job
							</h2>
						</div>
						<Jobs jobs={jobs} busy={busy} />
					</section>
					</>
				) : tab === "config" ? (
					<>
					<section className="card">
						<div className="card-head">
							<h2>
								<Icon name="tune" />
								Varian per target
							</h2>
							<code>tersimpan di database panel</code>
						</div>
						<div className="note" style={{ margin: "0 16px" }}>
							<Icon name="info" />
							<div>
								Di sinilah ditentukan tiap versi Android dan arsitektur dibangun jadi varian apa.
								Daftar ini yang dipakai saat build, bukan <code>config</code> utama atau config di{" "}
								<code>core/</code>. Config utama tetap dipakai untuk versi, kompresi, level zip, dan
								penanda builder.
							</div>
						</div>
						<TargetConfigForm overrides={overrides} count={Object.keys(overrides).length} />
					</section>
					<section className="card">
						<div className="card-head">
							<h2>
								<Icon name="apps" />
								Daftar paket per varian
							</h2>
							<code>paket addon yang ditambahkan ke gapps tiap varian</code>
						</div>
						<PackageListsForm
							lists={packageLists}
							changed={Object.keys(storedPackages)}
							order={PACKAGE_LISTS}
							labels={{
								micro: "micro",
								nano: "nano",
								basic: "basic",
								user: "user",
								go: "go",
								"core.keep": "Dilewati (sudah ada di gapps dasar)",
							}}
						/>
					</section>
					</>
				) : (
				<>
				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="checklist" />
							Build banyak target
						</h2>
						<code>bash web/build-batch.sh &lt;arch&gt;:&lt;sdk&gt;=&lt;varian&gt;</code>
					</div>
					<BatchBuildForm
						busy={busy}
						prefs={batchPrefs}
						overrides={overrides}
						serverGapps={serverGapps}
						localGapps={localGapps}
					/>
					<div className="legend">
						<span className="item">
							<Icon name="info" />
							<span>
								Semua target dibangun berurutan dalam satu job; kalau satu target gagal, sisanya
								tetap lanjut dan log mencatat mana yang gagal.
							</span>
						</span>
					</div>
				</section>

				<JobTerminal kinds={["build-batch"]} />

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="history" />
							Riwayat job
						</h2>
					</div>
					<Jobs jobs={jobs} busy={busy} />
				</section>
				</>
				)}

				<footer>
					<span className="item">
						<Icon name="info" />
						<span>
							Daftar source dan rilis yang sudah terbit ada di menu <b>Info</b>.
						</span>
					</span>
				</footer>
			</div>
		</>
	);
}
