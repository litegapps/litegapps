import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AppBar from "@/components/AppBar";
import Icon from "@/components/Icon";
import JobTerminal from "@/components/JobTerminal";
import { RunButton } from "@/components/RestoreControls";
import { saveAddonApiAutoAction, startJobAction } from "@/app/actions";
import { currentUser } from "@/lib/session";
import { runningJob } from "@/lib/jobs";
import {
	ADDON_ARCHS,
	readAddonDoc,
	readAddonIndex,
	readReleaseDoc,
	readReleaseIndex,
	type AddonEntry,
} from "@/lib/addonapi";
import { formatBytes } from "@/lib/restore";
import { KINDS_ADDON_API, SDKS, VARIANTS } from "@/lib/targets";
import { ADDONAPI_DAYS_MAX, readAddonApiAuto } from "@/lib/settings";

/*
 * File API: public JSON indexes served under /api/ without a login, which
 * this admin-only page manages:
 *  - Addon: the addon list the LiteGapps Controller app downloads
 *    (/api/addon/<arch>/<sdk>.json), also uploaded as README.md lists to the
 *    addon/ folders on SourceForge;
 *  - Rilis: the newest release of every variant per target
 *    (/api/litegapps/<arch>/<sdk>.json).
 * It reads what web/make-addon-api.sh / make-release-api.sh last wrote and
 * never calls SourceForge itself.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "File API — LiteGapps" };

/** ISO UTC -> "2026-09-20 07:50" in the panel's time zone (TZ, the host's). */
function when(iso: string): string {
	if (!iso) return "-";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Public address of the panel as the browser reached it (Cloudflare sets https). */
async function publicBase(): Promise<string> {
	const h = await headers();
	const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
	const proto = h.get("x-forwarded-proto") ?? (host.includes(":") ? "http" : "https");
	return host ? `${proto.split(",")[0]}://${host}` : "";
}

/** Next automatic run, same rule as addonApiTick() in lib/scheduler.ts. */
function nextOf(last: string, days: number): string {
	const ms = Date.parse(last);
	return Number.isFinite(ms) ? new Date(ms + days * 86_400_000).toISOString() : "";
}

function Md5({ md5 }: { md5: string }) {
	return md5 ? <code title={md5}>{md5.slice(0, 8)}</code> : <span className="tag">kosong</span>;
}

/** Run button for the whole tree or one target. */
function Refresh({
	kind,
	busy,
	back,
	label,
	arch,
	sdk,
}: {
	kind: "addon-api" | "release-api";
	busy: boolean;
	back: string;
	label: string;
	arch?: string;
	sdk?: number;
}) {
	return (
		<form action={startJobAction}>
			<input type="hidden" name="kind" value={kind} />
			{arch && <input type="hidden" name="arch" value={arch} />}
			{sdk !== undefined && <input type="hidden" name="sdk" value={String(sdk)} />}
			<input type="hidden" name="back" value={back} />
			<RunButton busy={busy} icon="sync" label={label} keepLabel />
		</form>
	);
}

function OpenJson({ href, label }: { href: string; label: string }) {
	return (
		<a className="btn tonal" href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
			<Icon name="open_in_new" />
			{label}
		</a>
	);
}

export default async function FileApiPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; done?: string; tab?: string; arch?: string; sdk?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const q = await searchParams;
	const tab = q.tab === "release" ? "release" : "addon";
	const selArch = (ADDON_ARCHS as readonly string[]).includes(q.arch ?? "") ? q.arch! : "";
	const selSdk = /^\d+$/.test(q.sdk ?? "") ? Number(q.sdk) : 0;
	const self = tab === "release" ? "/file-api?tab=release" : "/file-api";
	const selfTarget = `${self}${tab === "release" ? "&" : "?"}arch=${selArch}&sdk=${selSdk}`;
	const refreshable = (SDKS as readonly number[]).includes(selSdk);

	const [addonIndex, releaseIndex, running, base, auto] = await Promise.all([
		readAddonIndex(),
		readReleaseIndex(),
		runningJob(),
		publicBase(),
		readAddonApiAuto(),
	]);
	const addonDoc = tab === "addon" && selArch && selSdk ? await readAddonDoc(selArch, selSdk) : null;
	const releaseDoc = tab === "release" && selArch && selSdk ? await readReleaseDoc(selArch, selSdk) : null;
	const busy = running !== null;
	const addonLast = auto.last || addonIndex?.generated || "";
	const releaseLast = auto.releaseLast || releaseIndex?.generated || "";

	const entries: AddonEntry[] = addonDoc && selArch ? (addonDoc.arch[selArch] ?? []) : [];
	const variants = releaseDoc ? VARIANTS.map((v) => releaseDoc.variants[v]).filter((v) => v) : [];

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
				{q.done && (
					<div className="err ok" style={{ marginTop: 20 }}>
						<Icon name="check_circle" />
						<span>{q.done}</span>
					</div>
				)}

				<div className="hero" style={{ paddingBlock: "28px 8px" }}>
					<h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
						File API
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						JSON publik tanpa login untuk aplikasi: daftar addon di{" "}
						<code>{base}/api/addon/&lt;arch&gt;/&lt;sdk&gt;.json</code> dan rilis LiteGapps terbaru tiap
						varian di <code>{base}/api/litegapps/&lt;arch&gt;/&lt;sdk&gt;.json</code>.
					</p>
				</div>

				<nav className="tabs card" aria-label="Jenis File API" style={{ marginBottom: 0 }}>
					<Link href="/file-api" className={`tab${tab === "addon" ? " active" : ""}`}>
						<Icon name="extension" />
						Addon
					</Link>
					<Link href="/file-api?tab=release" className={`tab${tab === "release" ? " active" : ""}`}>
						<Icon name="package_2" />
						Rilis LiteGapps
					</Link>
				</nav>

				{selArch && selSdk > 0 && !addonDoc && !releaseDoc && (
					<div className="err" style={{ marginTop: 20 }}>
						<Icon name="error" />
						<span>
							Belum ada JSON {tab === "release" ? "rilis" : "addon"} untuk {selArch} SDK {selSdk}.
						</span>
					</div>
				)}

				{/* ── Addon ─────────────────────────────────────────────────── */}

				{tab === "addon" && addonDoc && (
					<section className="card">
						<div className="card-head">
							<h2>
								<Icon name="extension" />
								{selArch} &middot; Android {addonDoc.android || "?"} (SDK {addonDoc.sdk})
							</h2>
							<Link href={self} className="btn tonal" style={{ textDecoration: "none" }}>
								<Icon name="close" />
								Tutup
							</Link>
						</div>
						<div className="term-meta">
							<span>
								<Icon name="extension" />
								{entries.length} addon &middot; {formatBytes(addonDoc.size ?? 0)}
							</span>
							<span>
								<Icon name="update" />
								addon terbaru {when(addonDoc.updated)}
							</span>
							<span>
								<Icon name="schedule" />
								JSON dibuat {when(addonDoc.generated)}
							</span>
							{entries.some((e) => !e.md5) && (
								<span className="pill no">
									<Icon name="warning" />
									{entries.filter((e) => !e.md5).length} tanpa md5
								</span>
							)}
						</div>
						<div className="actions">
							<OpenJson href={`/api/addon/${selArch}/${addonDoc.sdk}.json`} label="Buka JSON" />
							<OpenJson
								href={`https://sourceforge.net/projects/litegapps/files/addon/${selArch}/${addonDoc.sdk}/`}
								label="SourceForge"
							/>
							{refreshable && (
								<Refresh
									kind="addon-api"
									busy={busy}
									back={selfTarget}
									label="Perbarui target ini"
									arch={selArch}
									sdk={addonDoc.sdk}
								/>
							)}
						</div>
						<div className="tscroll">
							<table className="jobs">
								<thead>
									<tr>
										<th>Addon</th>
										<th>Kategori</th>
										<th>Ukuran</th>
										<th>Update terakhir</th>
										<th>MD5</th>
										<th>Link</th>
									</tr>
								</thead>
								<tbody>
									{entries.map((e) => (
										<tr key={e.id}>
											<td className="lbl">
												{e.name}
												<div className="when" style={{ fontWeight: 400, fontSize: 12 }}>
													{e.file}
												</div>
											</td>
											<td>{e.category}</td>
											<td>{formatBytes(e.size)}</td>
											<td className="when">{when(e.updated)}</td>
											<td>
												<Md5 md5={e.md5} />
											</td>
											<td>
												<a href={e.url} target="_blank" rel="noreferrer">
													Unduh
												</a>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)}

				{tab === "addon" && (
					<section className="card">
						<div className="card-head">
							<h2>
								<Icon name="data_object" />
								JSON addon per target
							</h2>
							<code>{addonIndex ? `dibuat ${when(addonIndex.generated)}` : "belum pernah dibuat"}</code>
						</div>
						<div className="actions">
							<Refresh kind="addon-api" busy={busy} back={self} label="Perbarui semua JSON addon" />
							<OpenJson href="/api/addon/index.json" label="index.json" />
							<OpenJson href="https://sourceforge.net/projects/litegapps/files/addon/" label="SourceForge" />
						</div>

						{addonIndex?.targets.length ? (
							<div className="tscroll">
								<table className="jobs">
									<thead>
										<tr>
											<th>Target</th>
											<th>Addon</th>
											<th>Ukuran</th>
											<th>Update terakhir</th>
											<th>JSON</th>
										</tr>
									</thead>
									<tbody>
										{addonIndex.targets.map((t) => (
											<tr key={t.path}>
												<td className="lbl">
													<Link href={`/file-api?arch=${t.arch}&sdk=${t.sdk}`}>
														{t.arch} &middot; Android {t.android || "?"}
													</Link>
													<span className="when" style={{ fontWeight: 400 }}> (SDK {t.sdk})</span>
												</td>
												<td>{t.count}</td>
												<td>{formatBytes(t.size)}</td>
												<td className="when">{when(t.updated)}</td>
												<td>
													<a href={`/api/${t.path}`} target="_blank" rel="noreferrer">
														<code>{t.path}</code>
													</a>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<div className="note" style={{ margin: "0 16px 16px" }}>
								<Icon name="info" />
								<div>
									Belum ada JSON. Jalankan <b>Perbarui semua JSON addon</b> untuk membacanya dari folder{" "}
									<code>addon/</code> di SourceForge.
								</div>
							</div>
						)}

						<div className="legend">
							<span className="item">
								<Icon name="info" />
								<span>
									Addon yang sudah di-build di folder <code>addon/</code> SourceForge: nama, kategori,
									ukuran, md5, tanggal update terakhir dan link unduh. Format sama dengan{" "}
									<code>assets/addon-index</code> di aplikasi LiteGapps Controller (schema 1). Daftar yang
									sama diunggah sebagai <code>README.md</code> ke tiap folder addon, sehingga tampil di
									halaman Files SourceForge. Build banyak target memperbarui target yang addon-nya baru
									diunggah.
								</span>
							</span>
						</div>
					</section>
				)}

				{/* ── Rilis LiteGapps ───────────────────────────────────────── */}

				{tab === "release" && releaseDoc && (
					<section className="card">
						<div className="card-head">
							<h2>
								<Icon name="package_2" />
								{selArch} &middot; Android {releaseDoc.android || "?"} (SDK {releaseDoc.sdk})
							</h2>
							<Link href={self} className="btn tonal" style={{ textDecoration: "none" }}>
								<Icon name="close" />
								Tutup
							</Link>
						</div>
						<div className="term-meta">
							<span>
								<Icon name="package_2" />
								{variants.length} varian
							</span>
							<span>
								<Icon name="update" />
								rilis terbaru {when(releaseDoc.updated)}
							</span>
							<span>
								<Icon name="schedule" />
								JSON dibuat {when(releaseDoc.generated)}
							</span>
						</div>
						<div className="actions">
							<OpenJson href={`/api/litegapps/${selArch}/${releaseDoc.sdk}.json`} label="Buka JSON" />
							<OpenJson
								href={`https://sourceforge.net/projects/litegapps/files/litegapps/${selArch}/${releaseDoc.sdk}/`}
								label="SourceForge"
							/>
							{refreshable && (
								<Refresh
									kind="release-api"
									busy={busy}
									back={selfTarget}
									label="Perbarui target ini"
									arch={selArch}
									sdk={releaseDoc.sdk}
								/>
							)}
						</div>
						<div className="tscroll">
							<table className="jobs">
								<thead>
									<tr>
										<th>Varian</th>
										<th>Rilis</th>
										<th>File</th>
										<th>Ukuran</th>
										<th>Upload</th>
										<th>MD5</th>
									</tr>
								</thead>
								<tbody>
									{variants.map((v) =>
										v.files.map((f, i) => (
											<tr key={f.url}>
												<td className="lbl">{i === 0 ? v.variant : ""}</td>
												<td>
													{i === 0 && (
														<>
															{v.date}
															{v.legacy && (
																<span className="tag" style={{ marginLeft: 6 }}>
																	{v.version ? `v${v.version} · lama` : "lama"}
																</span>
															)}
														</>
													)}
												</td>
												<td>
													<a href={f.url} target="_blank" rel="noreferrer">
														{f.file}
													</a>
												</td>
												<td>{formatBytes(f.size)}</td>
												<td className="when">{when(f.updated)}</td>
												<td>
													<Md5 md5={f.md5} />
												</td>
											</tr>
										)),
									)}
								</tbody>
							</table>
						</div>
					</section>
				)}

				{tab === "release" && (
					<section className="card">
						<div className="card-head">
							<h2>
								<Icon name="data_object" />
								JSON rilis per target
							</h2>
							<code>{releaseIndex ? `dibuat ${when(releaseIndex.generated)}` : "belum pernah dibuat"}</code>
						</div>
						<div className="actions">
							<Refresh kind="release-api" busy={busy} back={self} label="Perbarui semua JSON rilis" />
							<OpenJson href="/api/litegapps/index.json" label="index.json" />
						</div>

						{releaseIndex?.targets.length ? (
							<div className="tscroll">
								<table className="jobs">
									<thead>
										<tr>
											<th>Target</th>
											<th>Varian (tanggal rilis)</th>
											<th>Update terakhir</th>
											<th>JSON</th>
										</tr>
									</thead>
									<tbody>
										{releaseIndex.targets.map((t) => (
											<tr key={t.path}>
												<td className="lbl">
													<Link href={`/file-api?tab=release&arch=${t.arch}&sdk=${t.sdk}`}>
														{t.arch} &middot; Android {t.android || "?"}
													</Link>
													<span className="when" style={{ fontWeight: 400 }}> (SDK {t.sdk})</span>
												</td>
												<td style={{ whiteSpace: "normal", minWidth: 240 }}>
													{Object.entries(t.variants).map(([v, d]) => (
														<span key={v} className="tag" style={{ margin: "2px 4px 2px 0" }} title={d}>
															{v} {d.slice(2)}
														</span>
													))}
												</td>
												<td className="when">{when(t.updated)}</td>
												<td>
													<a href={`/api/${t.path}`} target="_blank" rel="noreferrer">
														<code>{t.path}</code>
													</a>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<div className="note" style={{ margin: "0 16px 16px" }}>
								<Icon name="info" />
								<div>
									Belum ada JSON. Jalankan <b>Perbarui semua JSON rilis</b> untuk membacanya dari folder{" "}
									<code>litegapps/</code> di SourceForge.
								</div>
							</div>
						)}

						<div className="legend">
							<span className="item">
								<Icon name="info" />
								<span>
									Rilis terbaru tiap varian (folder tanggal terbaru di SourceForge): nama file, link unduh,
									ukuran, md5 dan waktu upload. Rilis lama berisi beberapa zip (AUTO, MAKSU, RECOVERY) -
									semuanya ada di <code>files</code>, yang pertama juga di atasnya. Target Android 7.0-8.0
									yang hanya punya rilis lama tanpa folder tanggal ditandai <code>legacy</code>. Build
									banyak target memperbarui target yang baru dirilis.
								</span>
							</span>
						</div>
					</section>
				)}

				{/* ── Schedule (both) ───────────────────────────────────────── */}

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="schedule" />
							Perbarui otomatis
						</h2>
						<span className={`pill ${auto.on ? "ok" : "no"}`}>
							<Icon name={auto.on ? "check" : "close"} />
							{auto.on ? "aktif" : "mati"}
						</span>
					</div>
					<form action={saveAddonApiAutoAction} className="actions" style={{ alignItems: "flex-end" }}>
						<label className="cl-switch toggle" style={{ flex: "1 1 100%" }}>
							<input type="checkbox" name="on" defaultChecked={auto.on} />
							<span>Perbarui semua JSON addon, README addon dan JSON rilis secara otomatis</span>
						</label>
						<div className="field" style={{ maxWidth: 200 }}>
							<label htmlFor="aa-days">Setiap (hari)</label>
							<input
								id="aa-days"
								type="number"
								name="days"
								min={1}
								max={ADDONAPI_DAYS_MAX}
								defaultValue={auto.days}
								required
							/>
						</div>
						<button className="btn tonal" type="submit">
							<Icon name="save" />
							Simpan
						</button>
					</form>
					<div className="tscroll">
						<table className="jobs">
							<thead>
								<tr>
									<th>JSON</th>
									<th>Terakhir</th>
									<th>Berikutnya</th>
								</tr>
							</thead>
							<tbody>
								{[
									{ name: "Addon + README", last: addonLast },
									{ name: "Rilis LiteGapps", last: releaseLast },
								].map((r) => (
									<tr key={r.name}>
										<td className="lbl">{r.name}</td>
										<td className="when">{when(r.last)}</td>
										<td className="when">
											{!auto.on ? "-" : nextOf(r.last, auto.days) ? `± ${when(nextOf(r.last, auto.days))}` : "segera"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<JobTerminal kinds={KINDS_ADDON_API} />
			</div>
		</>
	);
}
