"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { fileDeleteAction, fileMoveAction, fileRenameAction } from "@/app/actions";

/*
 * File manager rows with a three-dot menu (detail, rename, move, delete).
 * The menu and dialogs are client-side; every action itself is a server
 * action, so nothing about the filesystem is trusted from the browser - the
 * page only ever posts the path it was given.
 */

export type Entry = {
	name: string;
	rel: string;
	dir: boolean;
	link: boolean;
	size: number;
	mtime: number;
};

type Dialog = { kind: "detail" | "rename" | "move" | "delete"; entry: Entry } | null;

type DetailData = {
	detail?: {
		rel: string;
		name: string;
		dir: boolean;
		link: boolean;
		size: number;
		mtime: number;
		mode: string;
		uid: number;
		gid: number;
		items?: number;
	};
	preview?: string | null;
	error?: string;
};

export function formatBytes(n: number): string {
	if (!n) return "0 B";
	const u = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
	return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function when(ms: number): string {
	return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function iconFor(e: Entry): string {
	if (e.dir) return "folder";
	if (/\.(zip|tar|xz|gz|br|apk)$/i.test(e.name)) return "folder_zip";
	if (/\.(log|txt|md)$/i.test(e.name)) return "description";
	if (/\.(sh|json|ts|tsx|css|prop|info)$/i.test(e.name)) return "code";
	return "draft";
}

function Confirm({ label, danger }: { label: string; danger?: boolean }) {
	const { pending } = useFormStatus();
	return (
		<button className={danger ? "btn danger" : "btn"} type="submit" disabled={pending}>
			<Icon name={pending ? "hourglass_top" : danger ? "delete" : "check"} />
			{pending ? "Memproses…" : label}
		</button>
	);
}

export default function FileBrowser({ dir, entries }: { dir: string; entries: Entry[] }) {
	const [menu, setMenu] = useState<string | null>(null);
	const [dialog, setDialog] = useState<Dialog>(null);
	const [data, setData] = useState<DetailData | null>(null);
	const box = useRef<HTMLDivElement>(null);

	// Close the row menu on an outside click or Escape.
	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (box.current && !box.current.contains(e.target as Node)) setMenu(null);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			setMenu(null);
			setDialog(null);
		};
		document.addEventListener("mousedown", onDown);
		window.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	// Details are fetched only when the dialog opens, never for every row.
	useEffect(() => {
		if (dialog?.kind !== "detail") return;
		setData(null);
		let alive = true;
		fetch(`/api/files?path=${encodeURIComponent(dialog.entry.rel)}`, { cache: "no-store" })
			.then((r) => r.json())
			.then((d) => alive && setData(d))
			.catch(() => alive && setData({ error: "gagal memuat detail" }));
		return () => {
			alive = false;
		};
	}, [dialog]);

	const open = (kind: Dialog extends null ? never : NonNullable<Dialog>["kind"], entry: Entry) => {
		setMenu(null);
		setDialog({ kind, entry });
	};

	return (
		<div ref={box}>
			<div className="tscroll">
				<table className="jobs files">
					<thead>
						<tr>
							<th>Nama</th>
							<th>Ukuran</th>
							<th>Diubah</th>
							<th aria-label="Aksi" />
						</tr>
					</thead>
					<tbody>
						{entries.length === 0 && (
							<tr>
								<td colSpan={4} className="when">
									Folder kosong.
								</td>
							</tr>
						)}
						{entries.map((e) => (
							<tr key={e.rel}>
								<td className="fname">
									{e.dir ? (
										<Link href={`/files?path=${encodeURIComponent(e.rel)}`}>
											<Icon name={iconFor(e)} />
											<span>{e.name}</span>
										</Link>
									) : (
										<button type="button" onClick={() => open("detail", e)}>
											<Icon name={iconFor(e)} />
											<span>{e.name}</span>
										</button>
									)}
									{e.link && <span className="tag">LINK</span>}
								</td>
								<td className="when">{e.dir ? "—" : formatBytes(e.size)}</td>
								<td className="when">{when(e.mtime)}</td>
								<td className="fmenu">
									<button
										className="icon-btn"
										type="button"
										aria-label={`Menu ${e.name}`}
										aria-expanded={menu === e.rel}
										onClick={() => setMenu(menu === e.rel ? null : e.rel)}
									>
										<Icon name="more_vert" />
									</button>
									{menu === e.rel && (
										<div className="fmenu-pop" role="menu">
											<button type="button" onClick={() => open("detail", e)}>
												<Icon name="info" />
												Detail
											</button>
											<button type="button" onClick={() => open("rename", e)}>
												<Icon name="edit" />
												Rename
											</button>
											<button type="button" onClick={() => open("move", e)}>
												<Icon name="drive_file_move" />
												Pindahkan
											</button>
											<button type="button" className="danger" onClick={() => open("delete", e)}>
												<Icon name="delete" />
												Hapus
											</button>
										</div>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{dialog && (
				<>
					<div className="modal-backdrop" onClick={() => setDialog(null)} aria-hidden="true" />
					<div className="modal" role="dialog" aria-modal="true" aria-label={dialog.entry.name}>
						<div className="modal-head">
							<h3>
								{dialog.kind === "detail" && "Detail"}
								{dialog.kind === "rename" && "Rename"}
								{dialog.kind === "move" && "Pindahkan"}
								{dialog.kind === "delete" && "Hapus"}
							</h3>
							<button
								className="icon-btn"
								type="button"
								onClick={() => setDialog(null)}
								aria-label="Tutup"
							>
								<Icon name="close" />
							</button>
						</div>

						<div className="modal-body">
							<p className="fpath">
								<code>{dialog.entry.rel}</code>
							</p>

							{dialog.kind === "detail" && (
								<>
									{!data && <p className="cl-hint">Memuat…</p>}
									{data?.error && <p className="cl-hint">{data.error}</p>}
									{data?.detail && (
										<table className="kv">
											<tbody>
												<tr>
													<th>Jenis</th>
													<td>
														{data.detail.dir ? "Folder" : "File"}
														{data.detail.link ? " (symlink)" : ""}
													</td>
												</tr>
												<tr>
													<th>Ukuran</th>
													<td>
														{formatBytes(data.detail.size)}
														{data.detail.dir && data.detail.items !== undefined
															? ` · ${data.detail.items} item`
															: ""}
													</td>
												</tr>
												<tr>
													<th>Diubah</th>
													<td>{when(data.detail.mtime)}</td>
												</tr>
												<tr>
													<th>Izin</th>
													<td>
														{data.detail.mode} · uid {data.detail.uid} gid {data.detail.gid}
													</td>
												</tr>
											</tbody>
										</table>
									)}
									{data?.preview && <pre className="logbox">{data.preview}</pre>}
									{data?.detail && !data.detail.dir && data.preview === null && (
										<p className="cl-hint">File biner — isinya tidak ditampilkan.</p>
									)}
								</>
							)}

							{dialog.kind === "rename" && (
								<form action={fileRenameAction} className="fform">
									<input type="hidden" name="path" value={dialog.entry.rel} />
									<input type="hidden" name="dir" value={dir} />
									<div className="field">
										<label htmlFor="newname">Nama baru</label>
										<input id="newname" name="name" defaultValue={dialog.entry.name} autoFocus />
									</div>
									<Confirm label="Simpan" />
								</form>
							)}

							{dialog.kind === "move" && (
								<form action={fileMoveAction} className="fform">
									<input type="hidden" name="path" value={dialog.entry.rel} />
									<input type="hidden" name="dir" value={dir} />
									<div className="field">
										<label htmlFor="dest">Folder tujuan (relatif ke repo)</label>
										<input
											id="dest"
											name="dest"
											defaultValue={dir}
											placeholder="output/litegapps"
											autoFocus
										/>
									</div>
									<Confirm label="Pindahkan" />
								</form>
							)}

							{dialog.kind === "delete" && (
								<form action={fileDeleteAction} className="fform">
									<input type="hidden" name="path" value={dialog.entry.rel} />
									<input type="hidden" name="dir" value={dir} />
									<p>
										Hapus <b>{dialog.entry.name}</b>
										{dialog.entry.dir ? " beserta seluruh isinya" : ""}? Tidak bisa dibatalkan.
									</p>
									<Confirm label="Hapus" danger />
								</form>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
