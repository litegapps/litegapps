"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { savePackagesAction } from "@/app/actions";

/*
 * Which apps from the addon build land in each variant's gapps, and which
 * ones are skipped because the base gapps already ship them. The build reads
 * these through the environment, so editing here never touches a tracked
 * shell file.
 */

type Props = {
	/** list name -> packages, already resolved (stored value or default) */
	lists: Record<string, string[]>;
	/** names that are stored, i.e. changed from the default */
	changed: string[];
	labels: Record<string, string>;
	order: readonly string[];
};

function Save({ dirty }: { dirty: boolean }) {
	const { pending } = useFormStatus();
	return (
		<div className="cl-foot">
			<button className="btn" type="submit" disabled={pending || !dirty}>
				<Icon name={pending ? "hourglass_top" : "save"} />
				{pending ? "Menyimpan…" : "Simpan daftar paket"}
			</button>
			<span className="cl-count">{dirty ? "Ada perubahan." : "Belum ada perubahan."}</span>
		</div>
	);
}

export default function PackageListsForm({ lists, changed, labels, order }: Props) {
	const initial = Object.fromEntries(order.map((n) => [n, (lists[n] ?? []).join("\n")]));
	const [text, setText] = useState<Record<string, string>>(initial);
	const dirty = order.some((n) => text[n] !== initial[n]);

	return (
		<form action={savePackagesAction} className="checklist">
			{order.map((name) => (
				<div className="cl-group" key={name}>
					<div className="cl-head">
						<span>
							{labels[name] ?? name}
							{changed.includes(name) ? "" : " · bawaan"}
						</span>
						<span className="cl-count">
							{text[name].split(/\s+/).filter(Boolean).length} paket
						</span>
					</div>
					<textarea
						name={`pkg:${name}`}
						rows={5}
						value={text[name]}
						onChange={(e) => setText((s) => ({ ...s, [name]: e.target.value }))}
						spellCheck={false}
					/>
				</div>
			))}

			<Save dirty={dirty} />

			<p className="cl-hint">
				Satu nama paket per baris (nama folder seperti di hasil build addon, misalnya{" "}
				<code>GoogleDialer</code>). Varian <code>core</code> dan <code>pixel</code> tidak pakai
				daftar: core mengambil semua paket core kecuali yang ada di daftar terakhir, pixel mengambil
				semuanya. Daftar yang isinya sama dengan bawaan tidak disimpan.
			</p>
		</form>
	);
}
