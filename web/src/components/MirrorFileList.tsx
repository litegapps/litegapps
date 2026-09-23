"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { startJobAction } from "@/app/actions";
import type { MirrorFile, MirrorFileState } from "@/lib/mirror";
import { useBusy } from "./useBusy";

/*
 * Every mirrored source file, grouped folder -> architecture so the ~100
 * files fit on one screen folded. Each group says how many files it holds
 * and whether any differ from SourceForge; each file row carries a
 * three-dot menu with "Update source" (re-copy that file) and "Detail" (when
 * it was last copied to Drive, when it last changed on SourceForge).
 *
 * Rows are flex boxes, not table cells, so a long path wraps on a phone
 * instead of pushing the size and status off the screen.
 */

const STATE: Record<MirrorFileState, { cls: string; icon: string; text: string }> = {
	same: { cls: "ok", icon: "check", text: "sama" },
	differ: { cls: "run", icon: "sync_problem", text: "beda" },
	missing: { cls: "no", icon: "cloud_off", text: "belum di Drive" },
	"drive-only": { cls: "", icon: "cloud", text: "hanya di Drive" },
};

function size(n?: number): string {
	if (n === undefined) return "—";
	if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(2)} GB`;
	if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
	return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function when(iso?: string): string {
	if (!iso) return "—";
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/** "litegapps/arm64/36/36.zip" -> folder litegapps, group arm64, name 36/36.zip */
function place(path: string): { folder: string; group: string; name: string } {
	const parts = path.split("/");
	const folder = parts[0];
	if (folder === "base" && parts[1] === "gsi" && parts.length > 3) {
		return { folder, group: parts[2], name: parts.slice(3).join("/") };
	}
	if (parts.length > 2) return { folder, group: parts[1], name: parts.slice(2).join("/") };
	return { folder, group: "", name: parts.slice(1).join("/") };
}

/** "3 beda · 1 belum di Drive", or "" when every file matches */
function problems(files: MirrorFile[]): string {
	const n = (s: MirrorFileState) => files.filter((f) => f.state === s).length;
	return [
		n("differ") && `${n("differ")} beda`,
		n("missing") && `${n("missing")} belum di Drive`,
		n("drive-only") && `${n("drive-only")} hanya di Drive`,
	]
		.filter(Boolean)
		.join(" · ");
}

function totalSize(files: MirrorFile[]): number {
	return files.reduce((n, f) => n + (f.sf?.size ?? f.drive?.size ?? 0), 0);
}

function UpdateItem({ busy: initialBusy }: { busy: boolean }) {
	const { pending } = useFormStatus();
	const busy = useBusy(initialBusy);
	return (
		<button type="submit" className="menu-item" disabled={busy || pending}>
			<Icon name={pending ? "hourglass_top" : "cloud_sync"} />
			{busy ? "Ada job berjalan" : pending ? "Memulai…" : "Update source"}
		</button>
	);
}

function FileRow({ f, name, busy }: { f: MirrorFile; name: string; busy: boolean }) {
	const [open, setOpen] = useState(false);
	const s = STATE[f.state];
	return (
		<li className="mf-row">
			<div className="mf-main">
				<div className="mf-name">
					<code title={f.path}>{name}</code>
					<small>{size(f.sf?.size ?? f.drive?.size)}</small>
				</div>
				<span className={`pill ${s.cls}`}>
					<Icon name={s.icon} />
					{s.text}
				</span>
				<details className="rowmenu">
					<summary aria-label={`Menu ${f.path}`}>
						<Icon name="more_vert" />
					</summary>
					<div className="menu">
						{f.sf && (
							<form action={startJobAction}>
								<input type="hidden" name="kind" value="mirror-file" />
								<input type="hidden" name="path" value={f.path} />
								<input type="hidden" name="back" value="/mirror" />
								<UpdateItem busy={busy} />
							</form>
						)}
						<button
							type="button"
							className="menu-item"
							onClick={(e) => {
								setOpen((v) => !v);
								(e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
							}}
						>
							<Icon name="info" />
							{open ? "Tutup detail" : "Detail"}
						</button>
					</div>
				</details>
			</div>
			{open && (
				<dl className="kv mf-detail">
					<dt>File</dt>
					<dd>
						<code>{f.path}</code>
					</dd>
					<dt>Terakhir diperbarui di mirror</dt>
					<dd>
						{when(f.drive?.copied)} &middot; {size(f.drive?.size)}
					</dd>
					<dt>Terakhir diperbarui di SourceForge</dt>
					<dd>
						{when(f.sf?.mod)} &middot; {size(f.sf?.size)}
					</dd>
					<dt>Status</dt>
					<dd>
						{f.state === "same"
							? "Salinan di Drive sudah terbaru."
							: f.state === "differ"
								? "Ukuran atau waktunya berbeda - pakai Update source untuk menyalin ulang."
								: f.state === "missing"
									? "Belum ada di Drive - pakai Update source untuk menyalinnya."
									: "Sudah tidak ada di SourceForge; salinan di Drive tetap disimpan."}
					</dd>
				</dl>
			)}
		</li>
	);
}

/** A folder or architecture that folds; forced open while a search matches inside. */
function Group({
	id,
	title,
	files,
	forceOpen,
	level,
	children,
}: {
	id: string;
	title: string;
	files: MirrorFile[];
	forceOpen: boolean;
	level: 1 | 2;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const shown = open || forceOpen;
	const issue = problems(files);
	return (
		<div className={`mf-group mf-l${level}${shown ? " open" : ""}`}>
			<button
				type="button"
				className="mf-head"
				aria-expanded={shown}
				aria-controls={id}
				onClick={() => setOpen((v) => !v)}
			>
				<Icon name={shown ? "expand_more" : "chevron_right"} />
				<b>{title}</b>
				<span className="mf-count">
					{files.length} file &middot; {size(totalSize(files))}
				</span>
				{issue ? (
					<span className="pill run mf-state">
						<Icon name="sync_problem" />
						{issue}
					</span>
				) : (
					<span className="pill ok mf-state">
						<Icon name="check" />
						semua sama
					</span>
				)}
			</button>
			{shown && (
				<div id={id} className="mf-body">
					{children}
				</div>
			)}
		</div>
	);
}

const FOLDER_ORDER = ["litegapps", "package", "base", "bin"];
/** Same arch order as every other page of the panel. */
const GROUP_ORDER = ["arm64", "arm", "x86", "x86_64"];
const rank = (order: string[], v: string) => (order.includes(v) ? order.indexOf(v) : order.length);

export default function MirrorFileList({ files, busy }: { files: MirrorFile[]; busy: boolean }) {
	const [filter, setFilter] = useState("");
	const q = filter.trim();
	const shown = q ? files.filter((f) => f.path.includes(q)) : files;

	// folder -> group -> files, in a stable order
	const tree = useMemo(() => {
		const t = new Map<string, Map<string, { f: MirrorFile; name: string }[]>>();
		for (const f of shown) {
			const { folder, group, name } = place(f.path);
			if (!t.has(folder)) t.set(folder, new Map());
			const g = t.get(folder)!;
			if (!g.has(group)) g.set(group, []);
			g.get(group)!.push({ f, name });
		}
		return [...t.entries()]
			.sort((a, b) => rank(FOLDER_ORDER, a[0]) - rank(FOLDER_ORDER, b[0]))
			.map(
				([folder, g]) =>
					[
						folder,
						new Map([...g.entries()].sort((a, b) => rank(GROUP_ORDER, a[0]) - rank(GROUP_ORDER, b[0]))),
					] as const,
			);
	}, [shown]);

	return (
		<div className="mf">
			<div className="mf-search">
				<Icon name="search" />
				<input
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					placeholder="Cari file, mis. arm64/36 atau package"
					aria-label="Cari file"
					spellCheck={false}
				/>
				{q && (
					<span className="mf-count">
						{shown.length} dari {files.length}
					</span>
				)}
			</div>

			{tree.length === 0 && <p className="cl-hint">Tidak ada file yang cocok.</p>}

			{tree.map(([folder, groups]) => {
				const all = [...groups.values()].flat().map((x) => x.f);
				return (
					<Group key={folder} id={`mf-${folder}`} title={folder} files={all} forceOpen={!!q} level={1}>
						{[...groups.entries()].map(([group, items]) =>
							group ? (
								<Group
									key={group}
									id={`mf-${folder}-${group}`}
									title={group}
									files={items.map((x) => x.f)}
									forceOpen={!!q}
									level={2}
								>
									<ul className="mf-list">
										{items.map(({ f, name }) => (
											<FileRow key={f.path} f={f} name={name} busy={busy} />
										))}
									</ul>
								</Group>
							) : (
								<ul key="_" className="mf-list">
									{items.map(({ f, name }) => (
										<FileRow key={f.path} f={f} name={name} busy={busy} />
									))}
								</ul>
							),
						)}
					</Group>
				);
			})}
		</div>
	);
}
