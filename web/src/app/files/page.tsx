import Link from "next/link";
import { redirect } from "next/navigation";
import AppBar from "@/components/AppBar";
import Icon from "@/components/Icon";
import FileBrowser from "@/components/FileBrowser";
import { currentUser } from "@/lib/session";
import { listDir } from "@/lib/files";

export const dynamic = "force-dynamic";
export const metadata = { title: "File — LiteGapps" };

const SHORTCUTS = [
	{ path: "output/litegapps", icon: "inventory", label: "Output" },
	{ path: "log", icon: "description", label: "Log build" },
	{ path: "web/job-logs", icon: "terminal", label: "Log job" },
	{ path: "core/litegapps", icon: "android", label: "Varian" },
	{ path: "packages", icon: "inventory_2", label: "Packages" },
];

function crumbs(rel: string) {
	const parts = rel ? rel.split("/") : [];
	const out = [{ name: "repo", path: "" }];
	let acc = "";
	for (const p of parts) {
		acc = acc ? `${acc}/${p}` : p;
		out.push({ name: p, path: acc });
	}
	return out;
}

export default async function FilesPage({
	searchParams,
}: {
	searchParams: Promise<{ path?: string; error?: string; done?: string }>;
}) {
	const user = await currentUser();
	if (!user) redirect("/login");

	const q = await searchParams;
	let listing;
	let openError: string | null = null;
	try {
		listing = await listDir(q.path ?? "");
	} catch (e) {
		openError = e instanceof Error ? e.message : "folder tidak bisa dibuka";
		listing = await listDir("");
	}

	const parent = listing.rel ? listing.rel.split("/").slice(0, -1).join("/") : null;

	return (
		<>
			<AppBar user={user} />

			<div className="wrap">
				{(q.error || openError) && (
					<div className="err" style={{ marginTop: 20 }}>
						<Icon name="error" />
						<span>{q.error || openError}</span>
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
						File
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						Isi repo di VPS ini — hasil build, log, dan source yang sudah di-restore.
					</p>
				</div>

				<div className="chips" style={{ marginTop: 16 }}>
					{SHORTCUTS.map((s) => (
						<Link
							key={s.path}
							href={`/files?path=${encodeURIComponent(s.path)}`}
							className={`chip${listing.rel === s.path ? " on" : ""}`}
						>
							<span className="chip-main">{s.label}</span>
						</Link>
					))}
				</div>

				<section className="card">
					<div className="card-head">
						<nav className="crumbs" aria-label="Lokasi">
							{crumbs(listing.rel).map((c, i, all) => (
								<span key={c.path}>
									{i > 0 && <span className="sep">/</span>}
									{i === all.length - 1 ? (
										<b>{c.name}</b>
									) : (
										<Link href={`/files?path=${encodeURIComponent(c.path)}`}>{c.name}</Link>
									)}
								</span>
							))}
						</nav>
						<code>{listing.rel || "."}</code>
					</div>

					{parent !== null && (
						<div className="fup">
							<Link href={`/files?path=${encodeURIComponent(parent)}`} className="joblink">
								<Icon name="arrow_upward" />
								Naik satu folder
							</Link>
						</div>
					)}

					<FileBrowser dir={listing.rel} entries={listing.entries} />
				</section>

				<div className="note" style={{ marginTop: 20 }}>
					<Icon name="warning" />
					<div>
						Ini file sungguhan di repo VPS, bukan salinan. Hapus, rename, dan pindah langsung
						mengubahnya — file source yang ikut git bisa dikembalikan dengan{" "}
						<code>git checkout</code>, hasil build tidak. Folder <code>.git</code>,{" "}
						<code>node_modules</code>, dan file <code>.env</code>/<code>.ssh</code> sengaja tidak
						bisa dibuka dari sini.
					</div>
				</div>
			</div>
		</>
	);
}
