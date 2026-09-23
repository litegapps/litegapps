import { redirect } from "next/navigation";
import AppBar from "@/components/AppBar";
import Icon from "@/components/Icon";
import Jobs from "@/components/Jobs";
import JobTerminal from "@/components/JobTerminal";
import { RunButton } from "@/components/RestoreControls";
import { startJobAction } from "@/app/actions";
import MirrorTargetForm from "@/components/MirrorTargetForm";
import MirrorFileList from "@/components/MirrorFileList";
import Fold from "@/components/Fold";
import MirrorProgress from "@/components/MirrorProgress";
import { currentUser } from "@/lib/session";
import { listJobs, runningJob } from "@/lib/jobs";
import { readMirrorFiles, readMirrorStatus, rcloneSetup } from "@/lib/mirror";
import { readMirror } from "@/lib/settings";
import { KINDS_MIRROR } from "@/lib/targets";
import { formatBytes } from "@/lib/restore";

/*
 * Mirror source: a second copy of the build sources (files-server/) on Google
 * Drive, updated from SourceForge. The page itself never calls rclone or
 * SourceForge - it shows what the last job wrote into web/mirror-status.json,
 * the same rule as the availability matrix on /info.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Mirror source — LiteGapps" };

export default async function MirrorPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; done?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const { error, done } = await searchParams;
	const [setup, status, target, jobs, running, list] = await Promise.all([
		rcloneSetup(),
		readMirrorStatus(),
		readMirror(),
		listJobs(8, KINDS_MIRROR),
		runningJob(),
		readMirrorFiles(),
	]);
	const count = (s: string) => list?.files.filter((f) => f.state === s).length ?? 0;
	const busy = running !== null;
	const ready = setup.installed && setup.config && setup.remotes.length > 0;
	const totalFiles = status?.folders.reduce((n, f) => n + f.files, 0) ?? 0;
	const totalBytes = status?.folders.reduce((n, f) => n + f.bytes, 0) ?? 0;

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
						Mirror source
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						Salinan kedua source build (<code>files-server/</code>) di Google Drive, diperbarui
						dari SourceForge.
					</p>
				</div>

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="cloud_sync" />
							Isi mirror
						</h2>
						<code>{status ? status.generated : "belum pernah disinkron"}</code>
					</div>

					{status ? (
						<>
							<div className="term-meta">
								<span className={`pill ${status.ok ? "ok" : "no"}`}>
									<Icon name={status.ok ? "check" : "close"} />
									{status.mode === "sync" ? "sinkron" : "cek"} {status.ok ? "berhasil" : "gagal"}
								</span>
								<span>
									<Icon name="folder" />
									{status.remote}:{status.dir}
								</span>
								<span>
									<Icon name="description" />
									{totalFiles} file &middot; {formatBytes(totalBytes)}
								</span>
							</div>
							<div className="tscroll">
								<table className="jobs">
									<thead>
										<tr>
											<th>Folder source</th>
											<th>File di Drive</th>
											<th>Ukuran</th>
										</tr>
									</thead>
									<tbody>
										{status.folders.map((f) => (
											<tr key={f.name}>
												<td>
													<b>{f.name}</b>
												</td>
												<td>{f.files}</td>
												<td>{formatBytes(f.bytes)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</>
					) : (
						<div className="note" style={{ margin: "0 16px 16px" }}>
							<Icon name="info" />
							<div>
								Mirror belum pernah dijalankan. Jalankan <b>Cek mirror</b> dulu untuk melihat
								berapa file yang akan disalin, baru <b>Sinkron sekarang</b>.
							</div>
						</div>
					)}

					<div className="actions">
						<form action={startJobAction}>
							<input type="hidden" name="kind" value="mirror-check" />
							<input type="hidden" name="back" value="/mirror" />
							<RunButton
								busy={busy}
								blocked={!ready}
								blockedLabel="Token belum ada"
								icon="fact_check"
								label="Cek mirror"
								tone="tonal"
							/>
						</form>
						<form action={startJobAction}>
							<input type="hidden" name="kind" value="mirror-sync" />
							<input type="hidden" name="back" value="/mirror" />
							<RunButton
								busy={busy}
								blocked={!ready}
								blockedLabel="Token belum ada"
								icon="cloud_upload"
								label="Sinkron sekarang"
								confirmText={
									"Salin source dari SourceForge ke Google Drive?\n\n" +
									"Seluruh files-server (± 37 GB kalau mirror masih kosong) dibaca dari " +
									"SourceForge dan diunggah ke Drive Anda. File yang sudah sama dilewati.\n\n" +
									"File di Drive tidak pernah dihapus oleh proses ini."
								}
							/>
						</form>
					</div>

					<div className="legend">
						<span className="item">
							<Icon name="info" />
							<span>
								Hanya menyalin dan menimpa, tidak pernah menghapus file di Drive. Source dibaca
								langsung dari SourceForge lewat SFTP, jadi disk VPS tidak terpakai. Sinkron tidak
								bisa jalan bersamaan dengan build — panel hanya menjalankan satu job pada satu
								waktu.
							</span>
						</span>
					</div>
				</section>

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="list" />
							File yang di-mirror
						</h2>
						<code>{list ? list.generated : "belum ada daftar"}</code>
					</div>
					{list ? (
						<div className="checklist" style={{ paddingTop: 0 }}>
							<Fold
								id="mirror.files"
								title={`${list.files.length} file`}
								icon="folder_zip"
								summary={`${count("same")} sama · ${count("differ")} beda · ${count("missing")} belum di Drive`}
							>
								<MirrorFileList files={list.files} busy={busy} />
							</Fold>
							<p className="cl-hint">
								Tombol <b>⋮</b> di tiap baris: <b>Update source</b> menyalin ulang satu file itu dari
								SourceForge ke Drive, <b>Detail</b> menampilkan kapan file terakhir diperbarui di mirror
								dan di SourceForge. Daftar ini diperbarui setiap kali Cek, Sinkron, atau Update source
								dijalankan.
							</p>
						</div>
					) : (
						<div className="note" style={{ margin: "0 16px 16px" }}>
							<Icon name="info" />
							<div>
								Daftar file muncul setelah <b>Cek mirror</b> dijalankan sekali.
							</div>
						</div>
					)}
				</section>

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="settings" />
							Tujuan di Google Drive
						</h2>
						<code>rclone</code>
					</div>

					<div className="term-meta">
						<span className={`pill ${setup.installed ? "ok" : "no"}`}>
							<Icon name={setup.installed ? "check" : "close"} />
							rclone {setup.installed ? "terpasang" : "tidak ada"}
						</span>
						<span className={`pill ${setup.config ? "ok" : "no"}`}>
							<Icon name={setup.config ? "check" : "close"} />
							{setup.config ? "token ditemukan" : "token belum dibuat"}
						</span>
						{setup.remotes.map((r) => (
							<span key={r.name} className="pill">
								<Icon name="cloud" />
								{r.name} ({r.type})
							</span>
						))}
					</div>

					<MirrorTargetForm
						remote={target.remote}
						dir={target.dir}
						remotes={setup.remotes.map((r) => r.name)}
						busy={busy}
					/>

					{!ready && (
						<div className="note warn" style={{ margin: "0 16px 16px" }}>
							<Icon name="key" />
							<div>
								<b>Token Google Drive belum ada.</b> Buat sekali saja, langsung di VPS — jangan
								pernah menempelkan token ke chat:
								<ol className="faillist">
									<li>
										Di komputer yang punya browser, jalankan{" "}
										<code>rclone authorize &quot;drive&quot;</code> lalu izinkan aksesnya. Salin
										baris token yang muncul.
									</li>
									<li>
										Di VPS ini, jalankan <code>rclone config</code> sebagai user Anda sendiri:
										buat remote baru bertipe <code>drive</code>, jawab <b>n</b> pada pertanyaan
										&quot;Use auto config?&quot;, lalu tempel token tadi.
									</li>
									<li>
										File hasilnya harus berada di <code>~/.config/rclone/rclone.conf</code>. Folder
										itu di-mount read-only ke panel, di luar folder repo, jadi tidak pernah ikut
										git dan tidak terlihat di menu File.
									</li>
									<li>
										Jalankan <code>bash web/start.sh</code> supaya panel memuat token itu, lalu
										muat ulang halaman ini.
									</li>
								</ol>
								Disarankan memakai folder khusus di Drive, dan kalau bisa akun Google terpisah,
								karena token ini memberi akses ke Drive tersebut.
							</div>
						</div>
					)}
				</section>

				<MirrorProgress />

				<JobTerminal kinds={KINDS_MIRROR} />

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="history" />
							Riwayat job mirror
						</h2>
					</div>
					<Jobs jobs={jobs} busy={busy} />
				</section>
			</div>
		</>
	);
}
