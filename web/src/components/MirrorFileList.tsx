"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { startJobAction } from "@/app/actions";
import type { MirrorFile, MirrorFileState } from "@/lib/mirror";
import { useBusy } from "./useBusy";

/*
 * Every mirrored source file, SourceForge next to Google Drive. Each row has a
 * three-dot menu: "Update source" re-copies that one file from SourceForge,
 * "Detail" shows when each side was last changed.
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

function UpdateItem({ path, busy: initialBusy }: { path: string; busy: boolean }) {
	const { pending } = useFormStatus();
	const busy = useBusy(initialBusy);
	return (
		<button type="submit" className="menu-item" disabled={busy || pending}>
			<Icon name={pending ? "hourglass_top" : "cloud_sync"} />
			{busy ? "Ada job berjalan" : pending ? "Memulai…" : "Update source"}
			<span className="sr"> {path}</span>
		</button>
	);
}

function Row({ f, busy }: { f: MirrorFile; busy: boolean }) {
	const [open, setOpen] = useState(false);
	const s = STATE[f.state];
	return (
		<>
			<tr>
				<td className="lbl">
					<code>{f.path}</code>
				</td>
				<td>{size(f.sf?.size ?? f.drive?.size)}</td>
				<td>
					<span className={`pill ${s.cls}`}>
						<Icon name={s.icon} />
						{s.text}
					</span>
				</td>
				<td className="menucell">
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
									<UpdateItem path={f.path} busy={busy} />
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
				</td>
			</tr>
			{open && (
				<tr className="detailrow">
					<td colSpan={4}>
						<dl className="kv">
							<dt>Terakhir diperbarui di mirror (Drive)</dt>
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
									? "Ukuran dan waktunya sama - salinan di Drive sudah terbaru."
									: f.state === "differ"
										? "Ukuran atau waktunya berbeda - pakai Update source untuk menyalin ulang."
										: f.state === "missing"
											? "Belum ada di Drive - pakai Update source untuk menyalinnya."
											: "Sudah tidak ada di SourceForge; salinan di Drive tetap disimpan."}
							</dd>
						</dl>
					</td>
				</tr>
			)}
		</>
	);
}

export default function MirrorFileList({ files, busy }: { files: MirrorFile[]; busy: boolean }) {
	const [filter, setFilter] = useState("");
	const shown = filter ? files.filter((f) => f.path.includes(filter)) : files;
	return (
		<>
			<div className="buildform" style={{ paddingBottom: 0 }}>
				<div className="field">
					<label htmlFor="mfilter">Cari file</label>
					<input
						id="mfilter"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="mis. arm64/36 atau package"
						spellCheck={false}
					/>
				</div>
			</div>
			<div className="tscroll">
				<table className="jobs mirrorfiles">
					<thead>
						<tr>
							<th>File</th>
							<th>Ukuran</th>
							<th>Mirror</th>
							<th aria-label="Menu" />
						</tr>
					</thead>
					<tbody>
						{shown.map((f) => (
							<Row key={f.path} f={f} busy={busy} />
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}
