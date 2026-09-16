import { redirect } from "next/navigation";
import AppBar from "@/components/AppBar";
import Icon from "@/components/Icon";
import Jobs from "@/components/Jobs";
import JobTerminal from "@/components/JobTerminal";
import { RunButton } from "@/components/RestoreControls";
import { startJobAction } from "@/app/actions";
import { currentUser } from "@/lib/session";
import { listJobs, runningJob } from "@/lib/jobs";
import { readBackups } from "@/lib/backup";
import { KINDS_BACKUP } from "@/lib/targets";
import AutoBackupSwitch from "@/components/AutoBackupSwitch";
import { AUTO_BACKUP_HOUR, AUTO_BACKUP_LAST, autoBackupOn, getSetting } from "@/lib/settings";
import { formatBytes } from "@/lib/restore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Backup DB — LiteGapps" };

function when(ms: number | null): string {
	if (!ms) return "—";
	return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

/** litegapps-db-20260916-031500.lgdb -> 2026-09-16 03:15 */
function fromName(name: string): string {
	const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name);
	return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : name;
}

export default async function BackupPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const { error } = await searchParams;
	const [state, jobs, running, auto, autoLast] = await Promise.all([
		readBackups(),
		listJobs(8, KINDS_BACKUP),
		runningJob(),
		autoBackupOn(),
		getSetting(AUTO_BACKUP_LAST),
	]);
	const busy = running !== null;

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
						Backup Database
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						Isi database panel (akun admin, riwayat job, pengaturan, dan config target) disimpan
						terenkripsi ke SourceForge di{" "}
						<code>project/litegapps/db</code>.
					</p>
				</div>

				<div className="stats">
					<div className="stat">
						<div className="k">
							<Icon name="key" />
							Kunci enkripsi
						</div>
						<div className="v">{state.fingerprint ?? "belum ada"}</div>
					</div>
					<div className="stat">
						<div className="k">
							<Icon name="backup" />
							Backup
						</div>
						<div className="v">{state.backups.length}</div>
					</div>
					<div className="stat">
						<div className="k">
							<Icon name="schedule" />
							Otomatis
						</div>
						<div className="v">{auto ? "aktif" : "mati"}</div>
					</div>
					<div className="stat">
						<div className="k">
							<Icon name="update" />
							Daftar SF
						</div>
						{/* Date only: the full timestamp does not fit a stat card at
						    phone width, and it is repeated under the list below. */}
						<div className="v" title={state.generated ?? undefined}>
							{state.generated?.slice(0, 10) ?? "—"}
						</div>
					</div>
				</div>

				{!state.fingerprint && (
					<div className="note" style={{ marginTop: 20 }}>
						<Icon name="warning" />
						<div>
							<b>DB_BACKUP_KEY belum ada di web/.env.</b> Backup ditolak tanpa kunci, karena area
							rilis SourceForge bisa diunduh siapa saja. Jalankan <code>bash web/start.sh</code>{" "}
							untuk membuatnya.
						</div>
					</div>
				)}

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="schedule" />
							Backup otomatis
						</h2>
						<code>1x sehari &middot; jam {String(AUTO_BACKUP_HOUR).padStart(2, "0")}:00</code>
					</div>
					<AutoBackupSwitch on={auto} hour={AUTO_BACKUP_HOUR} />
					<div className="legend">
						<span className="item">
							<Icon name="info" />
							<span>
								Panel memeriksa tiap 5 menit: kalau hari ini belum ada backup otomatis dan jamnya
								sudah lewat, job backup dijalankan sendiri. Kalau VPS mati pada jam itu, backup
								dijalankan saat panel hidup lagi di hari yang sama. Terakhir otomatis:{" "}
								<b>{autoLast ?? "belum pernah"}</b>.
							</span>
						</span>
					</div>
				</section>

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="cloud_upload" />
							Buat backup manual
						</h2>
						<code>bash web/db-backup.sh &middot; bash web/db-list.sh</code>
					</div>
					<div className="actions">
						<form action={startJobAction}>
							<input type="hidden" name="kind" value="db-backup" />
							<input type="hidden" name="back" value="/backup" />
							<RunButton busy={busy} icon="cloud_upload" label="Backup sekarang" />
						</form>
						<form action={startJobAction}>
							<input type="hidden" name="kind" value="db-list" />
							<input type="hidden" name="back" value="/backup" />
							<RunButton busy={busy} tone="tonal" icon="sync" label="Segarkan daftar" />
						</form>
					</div>
					<div className="legend">
						<span className="item">
							<Icon name="lock" />
							<span>
								File dienkripsi AES-256-GCM dengan <code>DB_BACKUP_KEY</code> sebelum diunggah.
								Simpan kunci itu di tempat lain — tanpa kunci, backup tidak bisa dipulihkan.
							</span>
						</span>
						<span className="item">
							<Icon name="info" />
							<span>
								Sesi login tidak ikut dibackup, jadi restore tidak membuat siapa pun logout. Kalau
								password admin berubah setelah backup dibuat, hash lama otomatis diperbarui saat
								login berikutnya.
							</span>
						</span>
					</div>
				</section>

				<JobTerminal kinds={KINDS_BACKUP} />

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="history" />
							Daftar backup
						</h2>
						<code>
							web/db-backups/ &middot; {"<SF>"}/db/
							{state.generated ? ` · daftar SF dibaca ${state.generated}` : ""}
						</code>
					</div>
					{state.backups.length === 0 ? (
						<div className="msg">
							<Icon name="inbox" />
							Belum ada backup. Klik &quot;Backup sekarang&quot;, atau &quot;Segarkan daftar&quot;
							kalau backup-nya sudah ada di SourceForge.
						</div>
					) : (
						<div className="tscroll">
							<table className="jobs">
								<thead>
									<tr>
										<th>Dibuat</th>
										<th>Ukuran</th>
										<th>VPS</th>
										<th>SourceForge</th>
										<th>Restore</th>
									</tr>
								</thead>
								<tbody>
									{state.backups.map((b) => (
										<tr key={b.name}>
											<td className="lbl">
												<b>{fromName(b.name)}</b>
												<br />
												<small>{b.local ? when(b.mtime) : b.name}</small>
											</td>
											<td className="when">{formatBytes(b.size)}</td>
											<td>
												{b.local ? (
													<span className="pill ok">
														<Icon name="check" />
														ada
													</span>
												) : (
													<span className="pill no">
														<Icon name="close" />
														tidak
													</span>
												)}
											</td>
											<td>
												{b.remote ? (
													<span className="pill ok">
														<Icon name="check" />
														ada
													</span>
												) : (
													<span className="pill no">
														<Icon name="close" />
														belum
													</span>
												)}
											</td>
											<td>
												<form action={startJobAction}>
													<input type="hidden" name="kind" value="db-restore" />
													<input type="hidden" name="name" value={b.name} />
													<input type="hidden" name="back" value="/backup" />
													<RunButton
														busy={busy}
														tone="tonal"
														icon="settings_backup_restore"
														label="Restore"
														confirmText={`Pulihkan database dari backup ${fromName(b.name)}? Akun admin dan riwayat job saat ini akan diganti.`}
													/>
												</form>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
					{busy && running && (
						<div className="legend">
							<span className="item">
								<Icon name="sync" />
								<span>
									Sedang berjalan: <b>{running.label}</b>.
								</span>
							</span>
						</div>
					)}
				</section>

				<section className="card">
					<div className="card-head">
						<h2>
							<Icon name="terminal" />
							Riwayat job
						</h2>
					</div>
					<Jobs jobs={jobs} busy={busy} />
				</section>
			</div>
		</>
	);
}
