"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { saveBuildTargetsAction } from "@/app/actions";
import { ANDROID, ARCHS, SDKS, VARIANTS, defaultVariants } from "@/lib/targets";

/*
 * Per target (arch x Android) pick which variants are built. This is what the
 * build follows instead of `config` and the per-variant configs under core/:
 * the target decides, not the repo.
 *
 * A row left on the default is not stored at all, so it keeps following the
 * built-in default list.
 */

type Props = {
	/** "<arch>-<sdk>" -> variants, only for targets that differ from the default */
	overrides: Record<string, string[]>;
	count: number;
};

function Save({ dirty }: { dirty: number }) {
	const { pending } = useFormStatus();
	return (
		<div className="cl-foot">
			<button className="btn" type="submit" disabled={pending || dirty === 0}>
				<Icon name={pending ? "hourglass_top" : "save"} />
				{pending ? "Menyimpan…" : "Simpan config target"}
			</button>
			<span className="cl-count">
				{dirty === 0 ? "Belum ada perubahan." : `${dirty} target diubah.`}
			</span>
		</div>
	);
}

export default function TargetConfigForm({ overrides, count }: Props) {
	const [arch, setArch] = useState<string>("arm64");
	const [state, setState] = useState<Record<string, string[]>>(overrides);

	const key = (a: string, s: number) => `${a}-${s}`;
	const listOf = (a: string, s: number) => state[key(a, s)] ?? defaultVariants(a, s);
	const isDefault = (a: string, s: number) => state[key(a, s)] === undefined;

	const toggle = (a: string, s: number, v: string) => {
		const cur = listOf(a, s);
		const next = cur.includes(v)
			? cur.filter((x) => x !== v)
			: [...VARIANTS].filter((x) => cur.includes(x) || x === v);
		setState((st) => ({ ...st, [key(a, s)]: next }));
	};

	const reset = (a: string, s: number) =>
		setState((st) => {
			const copy = { ...st };
			delete copy[key(a, s)];
			return copy;
		});

	const dirty = Object.keys(state).filter((k) => {
		const [a, s] = [k.slice(0, k.lastIndexOf("-")), Number(k.slice(k.lastIndexOf("-") + 1))];
		const def = defaultVariants(a, s);
		const cur = state[k];
		return !(cur.length === def.length && cur.every((v) => def.includes(v)));
	}).length;

	return (
		<form action={saveBuildTargetsAction} className="checklist">
			{/* One row per target, only for what the user touched or overrode. */}
			{Object.entries(state).map(([k, list]) => (
				<input key={k} type="hidden" name="target" value={`${k}=${list.join(",")}`} />
			))}

			<div className="cl-group">
				<div className="cl-head">
					<span>Arsitektur</span>
					<span className="cl-count">
						{count} target diatur sendiri, sisanya memakai daftar bawaan
					</span>
				</div>
				<div className="chips">
					{ARCHS.map((a) => (
						<label key={a} className={`chip${arch === a ? " on" : ""}`}>
							<input
								type="radio"
								name="arch-view"
								checked={arch === a}
								onChange={() => setArch(a)}
							/>
							<span className="chip-main">{a}</span>
						</label>
					))}
				</div>
			</div>

			<div className="tscroll">
				<table className="jobs targetcfg">
					<thead>
						<tr>
							<th>Android</th>
							{VARIANTS.map((v) => (
								<th key={v}>{v}</th>
							))}
							<th>Bawaan</th>
						</tr>
					</thead>
					<tbody>
						{[...SDKS].reverse().map((s) => {
							const list = listOf(arch, s);
							return (
								<tr key={s}>
									<td className="lbl">
										<b>{ANDROID[s] ?? s}</b>
										<br />
										<small>SDK {s}</small>
									</td>
									{VARIANTS.map((v) => (
										<td key={v}>
											<input
												type="checkbox"
												aria-label={`${v} untuk ${arch} SDK ${s}`}
												checked={list.includes(v)}
												onChange={() => toggle(arch, s, v)}
											/>
										</td>
									))}
									<td className="when">
										{isDefault(arch, s) ? (
											<span className="tag">BAWAAN</span>
										) : (
											<button type="button" className="joblink" onClick={() => reset(arch, s)}>
												kembalikan
											</button>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<Save dirty={dirty} />

			<p className="cl-hint">
				Baris tanpa centang sama sekali berarti target itu tidak dibangun. Target yang masih
				memakai daftar bawaan tidak disimpan, jadi database hanya berisi yang benar-benar Anda
				ubah — dan ikut terbawa saat backup/restore database.
			</p>
		</form>
	);
}
