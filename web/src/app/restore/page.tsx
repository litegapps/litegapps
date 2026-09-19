import Link from "next/link";
import { redirect } from "next/navigation";
import AppBar from "@/components/AppBar";
import Icon from "@/components/Icon";
import Jobs from "@/components/Jobs";
import JobTerminal from "@/components/JobTerminal";
import { RunButton, TargetPicker } from "@/components/RestoreControls";
import { startJobAction } from "@/app/actions";
import { currentUser } from "@/lib/session";
import { listJobs, runningJob } from "@/lib/jobs";
import { readStatus } from "@/lib/status";
import { formatBytes, readRestoreOverview, readTargetState } from "@/lib/restore";
import {
	ARCHS,
	GO_UNSUPPORTED_MSG,
	KINDS_RESTORE,
	SDKS,
	UNSUPPORTED_MSG,
	targetSupported,
	variantSupported,
} from "@/lib/targets";
import { readOverrides, resolveVariants } from "@/lib/buildtargets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Restore — LiteGapps" };

const TABS = [
	{ id: "package", icon: "inventory_2", label: "Package" },
	{ id: "litegapps", icon: "android", label: "LiteGapps" },
] as const;

function Yes({ on, yes = "ada", no = "belum ada" }: { on: boolean; yes?: string; no?: string }) {
	return (
		<span className={`pill ${on ? "ok" : "no"}`}>
			<Icon name={on ? "check" : "close"} />
			{on ? yes : no}
		</span>
	);
}

export default async function RestorePage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; arch?: string; sdk?: string; error?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const q = await searchParams;
	const tab = q.tab === "litegapps" ? "litegapps" : "package";
	const arch = (ARCHS as readonly string[]).includes(q.arch ?? "") ? q.arch! : "arm64";
	const sdk = (SDKS as readonly number[]).includes(Number(q.sdk)) ? Number(q.sdk) : 36;
	const here = `/restore?tab=${tab}&arch=${arch}&sdk=${sdk}`;

	const [status, overview, target, jobs, running, overrides] = await Promise.all([
		readStatus(),
		readRestoreOverview(),
		readTargetState(arch, sdk),
		listJobs(10, KINDS_RESTORE),
		runningJob(),
		readOverrides(),
	]);
	const busy = running !== null;
	// An unsupported target cannot be restored: its restore buttons stay off
	// (the server refuses the job anyway). Restore bin and deleting old
	// sources still work.
	const supported = targetSupported(arch, sdk);
	const server = status?.targets[arch]?.[String(sdk)];
	// Same list the build uses for this target, so a restore brings down what
	// will actually be built.
	const rule = resolveVariants(arch, sdk, overrides);

	return (
		<>
			<AppBar user={user} />

			<div className="wrap">
				{q.error && (
					<div className="err" style={{ marginTop: 20 }}>
						<Icon name="error" />
						<span>{q.error}</span>
					</div>
				)}

				<div className="hero" style={{ paddingBlock: "28px 8px" }}>
					<h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
						Restore
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						Unduh dan ekstrak source build dari SourceForge ke VPS ini, per arsitektur dan SDK.
					</p>
				</div>

				<div className="stats">
					<div className="stat">
						<div className="k">
							<Icon name="terminal" />
							bin
						</div>
						<div className="v" title={overview.binArchs.join(", ")}>
							{overview.binArchs.length}
							<small> / {ARCHS.length} arch</small>
						</div>
					</div>
					<div className="stat">
						<div className="k">
							<Icon name="hard_drive" />
							Disk kosong
						</div>
						<div className="v">
							{overview.disk ? formatBytes(overview.disk.free) : "—"}
						</div>
					</div>
					<div className="stat">
						<div className="k">
							<Icon name="deployed_code" />
							Target ter-restore
						</div>
						<div className="v">{overview.restored.length}</div>
					</div>
				</div>

				{!overview.bin && (
					<div className="note" style={{ marginTop: 20 }}>
						<Icon name="info" />
						<div>
							<b>bin/ belum di-restore.</b> Semua build butuh <code>bin/</code>. Restore LiteGapps
							otomatis ikut mengambilnya, atau jalankan restore bin di bawah.
						</div>
					</div>
				)}

				<section className="card">
					<nav className="tabs" aria-label="Jenis restore">
						{TABS.map((t) => (
							<Link
								key={t.id}
								href={`/restore?tab=${t.id}&arch=${arch}&sdk=${sdk}`}
								className={`tab${tab === t.id ? " active" : ""}`}
								aria-current={tab === t.id ? "page" : undefined}
							>
								<Icon name={t.icon} />
								<span>{t.label}</span>
							</Link>
						))}
					</nav>

					<TargetPicker tab={tab} arch={arch} sdk={sdk} />

					{!supported && (
						<div className="note" style={{ margin: "0 16px 16px" }}>
							<Icon name="block" />
							<div>
								<b>{UNSUPPORTED_MSG}.</b> Google tidak lagi membuat image ponsel x86 32-bit
								dengan GMS sejak Android 11, jadi target ini tidak di-restore maupun dibangun.
								Rilis x86 sampai Android 15 tetap tersedia.
							</div>
						</div>
					)}

					{tab === "package" ? (
						<>
							<div className="card-head" style={{ borderTop: "1px solid var(--md-outline-variant)" }}>
								<h2>
									<Icon name="inventory_2" />
									Package source {arch} SDK {sdk}
								</h2>
								<code>bash packages/make restore {arch} {sdk}</code>
							</div>
							<div className="tscroll">
								<table className="kv">
									<tbody>
										<tr>
											<th>Di server (status.json)</th>
											<td>
												{server ? <Yes on={server.package} /> : "— (tidak ada di status.json)"}
											</td>
										</tr>
										<tr>
											<th>Zip unduhan lokal</th>
											<td>
												<Yes
													on={target.packageZip.present}
													yes={formatBytes(target.packageZip.bytes)}
												/>
											</td>
										</tr>
										<tr>
											<th>Terekstrak</th>
											<td>
												<Yes on={target.packageFiles} yes="ya" no="belum" />
											</td>
										</tr>
									</tbody>
								</table>
							</div>
							<div className="actions">
								<form action={startJobAction}>
									<input type="hidden" name="kind" value="restore-package" />
									<input type="hidden" name="arch" value={arch} />
									<input type="hidden" name="sdk" value={sdk} />
									<input type="hidden" name="back" value={here} />
									<RunButton busy={busy} blocked={!supported} label="Restore package" />
								</form>
							</div>
							<div className="legend">
								<span className="item">
									<Icon name="info" />
									<span>
										Package arm64 besarnya sekitar 1–1,6 GB. Zip yang sudah ada tidak diunduh ulang,
										hanya diekstrak lagi.
									</span>
								</span>
							</div>
						</>
					) : (
						// Keyed by target: the checkboxes are uncontrolled, so without a
						// new key their defaults would carry over when switching SDK.
						<form action={startJobAction} key={`${arch}-${sdk}`}>
							<input type="hidden" name="kind" value="restore-gapps" />
							<input type="hidden" name="arch" value={arch} />
							<input type="hidden" name="sdk" value={sdk} />
							<input type="hidden" name="back" value={here} />
							<div className="card-head" style={{ borderTop: "1px solid var(--md-outline-variant)" }}>
								<h2>
									<Icon name="android" />
									Gapps source {arch} SDK {sdk}
								</h2>
								<code>
									sh build.sh restore litegapps &lt;varian&gt; {arch} {sdk}
								</code>
							</div>
							<div className="tscroll">
								<table className="kv">
									<tbody>
										<tr>
											<th>{sdk}.zip di server</th>
											<td>{server ? <Yes on={server.gapps} /> : "— (tidak ada di status.json)"}</td>
										</tr>
										<tr>
											<th>{sdk}-lite.zip di server</th>
											<td>{server ? <Yes on={server.lite} /> : "—"}</td>
										</tr>
										<tr>
											<th>superlite.zip di server</th>
											<td>{server ? <Yes on={server.superlite} /> : "—"}</td>
										</tr>
									</tbody>
								</table>
							</div>
							<div className="tscroll">
								<table className="jobs vtable">
									<thead>
										<tr>
											<th>Pilih</th>
											<th>Varian</th>
											<th>Terekstrak</th>
											<th>Zip lokal</th>
										</tr>
									</thead>
									<tbody>
										{target.variants.map((v) => (
											<tr key={v.variant}>
												<td>
													<input
														type="checkbox"
														name="variants"
														value={v.variant}
														id={`v-${v.variant}`}
														defaultChecked={rule.includes(v.variant)}
														disabled={!variantSupported(v.variant, arch, sdk)}
													/>
												</td>
												<td>
													<label htmlFor={`v-${v.variant}`}>
														<b>{v.variant}</b>
														{rule.includes(v.variant) && <span className="tag">DIBANGUN</span>}
														{!variantSupported(v.variant, arch, sdk) && (
															<span className="tag" title={GO_UNSUPPORTED_MSG}>
																TIDAK DIDUKUNG
															</span>
														)}
													</label>
												</td>
												<td>
													<Yes on={v.gapps} yes="ya" no="belum" />
												</td>
												<td className="when">{v.zips.length ? v.zips.join(", ") : "—"}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<div className="actions">
								<RunButton busy={busy} blocked={!supported} label="Restore gapps" />
							</div>
							<div className="legend">
								<span className="item">
									<span className="tag">DIBANGUN</span>
									<span>
										dicentang otomatis: varian yang dibangun untuk target ini menurut{" "}
										<b>Config target</b> di halaman Build.
									</span>
								</span>
								<span className="item">
									<Icon name="info" />
									<span>
										lite memakai <code>{sdk}-lite.zip</code> bila ada; superlite memakai{" "}
										<code>superlite.zip</code>
										{server && !server.superlite && (
											<> — belum ada di server, jadi jatuh ke <code>{sdk}.zip</code></>
										)}
										. bin.zip ikut di-restore.
									</span>
								</span>
							</div>
						</form>
					)}
				</section>

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="build_circle" />
							Lainnya
						</h2>
						<code>sh build.sh restore bin &middot; bash web/clean-sources.sh {arch} {sdk}</code>
					</div>
					<div className="actions">
						<form action={startJobAction}>
							<input type="hidden" name="kind" value="restore-bin" />
							<input type="hidden" name="back" value={here} />
							<RunButton
								busy={busy}
								tone="tonal"
								icon="terminal"
								label={overview.binZip.present ? "Ekstrak ulang bin" : "Restore bin"}
							/>
						</form>
						<form action={startJobAction}>
							<input type="hidden" name="kind" value="clean-sources" />
							<input type="hidden" name="arch" value={arch} />
							<input type="hidden" name="sdk" value={sdk} />
							<input type="hidden" name="back" value={here} />
							<RunButton
								busy={busy}
								tone="tonal"
								icon="delete"
								label={`Hapus source ${arch} ${sdk}`}
								confirmText={`Hapus semua source package dan gapps ${arch} SDK ${sdk}? Hasil build di output/ tetap disimpan.`}
							/>
						</form>
					</div>
					{busy && running && (
						<div className="legend">
							<span className="item">
								<Icon name="sync" />
								<span>
									Sedang berjalan: <b>{running.label}</b>. Satu job pada satu waktu.
								</span>
							</span>
						</div>
					)}
				</section>

				<JobTerminal kinds={KINDS_RESTORE} />

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="deployed_code" />
							Sudah di-restore di VPS
						</h2>
					</div>
					{overview.restored.length === 0 ? (
						<div className="msg">
							<Icon name="inbox" />
							Belum ada source yang di-restore.
						</div>
					) : (
						<div className="tscroll">
							<table className="jobs">
								<thead>
									<tr>
										<th>Target</th>
										<th>Package</th>
										<th>Gapps</th>
									</tr>
								</thead>
								<tbody>
									{overview.restored.map((r) => (
										<tr key={`${r.arch}-${r.sdk}`}>
											<td>
												<Link
													className="joblink"
													href={`/restore?tab=${tab}&arch=${r.arch}&sdk=${r.sdk}`}
												>
													{r.arch} SDK {r.sdk}
												</Link>
											</td>
											<td>
												{r.package ? <Yes on yes="ya" /> : "—"}
											</td>
											<td className="lbl">{r.variants.length ? r.variants.join(", ") : "—"}</td>
										</tr>
									))}
								</tbody>
							</table>
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
			</div>
		</>
	);
}
