import Link from "next/link";
import { redirect } from "next/navigation";
import AppBar from "@/components/AppBar";
import Icon from "@/components/Icon";
import ConfigForm from "@/components/ConfigForm";
import { currentUser } from "@/lib/session";
import { runningJob } from "@/lib/jobs";
import { CONFIG_FILES, readConfigDoc } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Config — LiteGapps" };

const VARIANT_IDS = CONFIG_FILES.filter(
	(f) => f.id.startsWith("litegapps:") || f.id.startsWith("litegappsx:"),
);

function groupOf(id: string) {
	if (id === "main") return "main";
	if (id === "packages") return "packages";
	return "variant";
}

const TABS = [
	{ group: "main", id: "main", icon: "tune", label: "Utama" },
	{ group: "variant", id: "litegapps:lite", icon: "category", label: "Varian" },
	{ group: "packages", id: "packages", icon: "inventory_2", label: "Packages" },
] as const;

export default async function ConfigPage({
	searchParams,
}: {
	searchParams: Promise<{ id?: string; error?: string; saved?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const q = await searchParams;
	const id = CONFIG_FILES.some((f) => f.id === q.id) ? q.id! : "main";
	const group = groupOf(id);

	const [doc, running] = await Promise.all([readConfigDoc(id), runningJob()]);
	const busy = running !== null;

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
				{q.saved && (
					<div className="err ok" style={{ marginTop: 20 }}>
						<Icon name="check_circle" />
						<span>
							Tersimpan: <b>{q.saved}</b>
						</span>
					</div>
				)}

				<div className="hero" style={{ paddingBlock: "28px 8px" }}>
					<h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
						Config
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						Mengubah file config shell yang dipakai build — versi, kompresi, level zip, dan target
						default tiap varian.
					</p>
				</div>

				<section className="card">
					<nav className="tabs" aria-label="File config">
						{TABS.map((t) => (
							<Link
								key={t.group}
								href={`/config?id=${encodeURIComponent(t.id)}`}
								className={`tab${group === t.group ? " active" : ""}`}
								aria-current={group === t.group ? "page" : undefined}
							>
								<Icon name={t.icon} />
								<span>{t.label}</span>
							</Link>
						))}
					</nav>

					{group === "variant" && (
						<div className="chips" style={{ padding: "14px 16px 0" }}>
							{VARIANT_IDS.map((f) => (
								<Link
									key={f.id}
									href={`/config?id=${encodeURIComponent(f.id)}`}
									className={`chip${id === f.id ? " on" : ""}`}
								>
									<span className="chip-main">{f.label}</span>
								</Link>
							))}
						</div>
					)}

					{doc ? (
						<>
							<div className="card-head" style={{ borderTop: 0 }}>
								<h2>
									<Icon name="description" />
									{doc.label}
								</h2>
								<code>{doc.file}</code>
							</div>
							{doc.note && (
								<div className="note" style={{ margin: "0 16px" }}>
									<Icon name="info" />
									<div>{doc.note}</div>
								</div>
							)}
							<ConfigForm id={doc.id} entries={doc.entries} busy={busy} />
							<details className="cfg-raw">
								<summary>Lihat isi file</summary>
								<pre className="logbox">{doc.raw}</pre>
							</details>
						</>
					) : (
						<div className="msg">
							<Icon name="error" />
							File config tidak terbaca.
						</div>
					)}
				</section>

				<div className="note" style={{ marginTop: 20 }}>
					<Icon name="warning" />
					<div>
						Halaman ini mengubah <b>file config di repo</b>, yang dipakai semua orang yang clone.
						Untuk identitas dan versi build di VPS ini, pakai <b>Build → Config target</b>: nilainya
						disimpan di database panel dan tidak pernah ikut ke git.
						<br />
						<br />
						File ini ikut di git. Perubahan di sini muncul sebagai perubahan file di repo, jadi
						commit atau kembalikan lewat git seperti biasa. Komentar dan urutan baris tidak diubah —
						hanya nilai di kanan tanda <code>=</code>.
					</div>
				</div>
			</div>
		</>
	);
}
