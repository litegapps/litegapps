"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { saveConfigAction } from "@/app/actions";
import { ANDROID, ARCHS, SDKS, VARIANTS } from "@/lib/targets";

/*
 * Editor for one shell config file. Every key keeps its own control, chosen
 * from the key name and the `#` comment the file already documents it with,
 * but each one writes through a hidden input holding the exact string that
 * lands in the file — so what the form posts is always a plain `key=value`.
 */

export type Entry = { key: string; value: string; hint: string[] };

type Field =
	| { kind: "bool" }
	| { kind: "choice"; options: string[] }
	| { kind: "list"; options: string[]; labels?: Record<string, string> }
	| { kind: "text"; long?: boolean };

const LEVELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const SDK_LABELS = Object.fromEntries(
	SDKS.map((s) => [String(s), `${ANDROID[s] ?? s} · ${s}`]),
) as Record<string, string>;

function fieldFor(key: string, value: string): Field {
	if (value === "true" || value === "false") return { kind: "bool" };
	switch (key) {
		case "compression":
			return { kind: "choice", options: ["br", "xz"] };
		case "compression.level":
		case "zip.level":
			return { kind: "choice", options: LEVELS };
		case "litegapps.tar":
			return { kind: "choice", options: ["single", "multi"] };
		case "litegapps.restore":
		case "litegapps.type":
			return { kind: "list", options: [...VARIANTS] };
		case "litegappsx.restore":
		case "litegappsx.type":
			return { kind: "list", options: ["microg"] };
		case "arch":
		case "restore.arch":
			return { kind: "list", options: [...ARCHS] };
		case "sdk":
		case "restore.sdk":
			return { kind: "list", options: SDKS.map(String), labels: SDK_LABELS };
		case "desc":
			return { kind: "text", long: true };
		default:
			return { kind: "text" };
	}
}

function Row({
	entry,
	value,
	onChange,
}: {
	entry: Entry;
	value: string;
	onChange: (v: string) => void;
}) {
	const field = fieldFor(entry.key, entry.value);
	const picked = value ? value.split(",").filter(Boolean) : [];

	return (
		<div className="cfg-row">
			<div className="cfg-label">
				<code>{entry.key}</code>
				{entry.hint.map((h, i) => (
					<span key={i} className="cfg-hint">
						{h}
					</span>
				))}
			</div>

			<div className="cfg-control">
				<input type="hidden" name={`v:${entry.key}`} value={value} />

				{field.kind === "bool" && (
					<label className="cl-switch">
						<input
							type="checkbox"
							checked={value === "true"}
							onChange={(e) => onChange(e.target.checked ? "true" : "false")}
						/>
						<span>{value === "true" ? "true" : "false"}</span>
					</label>
				)}

				{field.kind === "choice" && (
					<select value={value} onChange={(e) => onChange(e.target.value)}>
						{(field.options.includes(value) ? field.options : [value, ...field.options]).map(
							(o) => (
								<option key={o} value={o}>
									{o}
								</option>
							),
						)}
					</select>
				)}

				{field.kind === "list" && (
					<div className="chips">
						{field.options.map((o) => {
							const on = picked.includes(o);
							return (
								<label key={o} className={`chip${on ? " on" : ""}`}>
									<input
										type="checkbox"
										checked={on}
										onChange={() =>
											onChange(
												(on
													? picked.filter((x) => x !== o)
													: field.options.filter((x) => picked.includes(x) || x === o)
												).join(","),
											)
										}
									/>
									<span className="chip-main">{field.labels?.[o] ?? o}</span>
								</label>
							);
						})}
					</div>
				)}

				{field.kind === "text" &&
					(field.long ? (
						<textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
					) : (
						<input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
					))}
			</div>
		</div>
	);
}

function Save({ busy, dirty }: { busy: boolean; dirty: number }) {
	const { pending } = useFormStatus();
	const disabled = busy || pending || dirty === 0;
	return (
		<div className="cl-foot">
			<button className="btn" type="submit" disabled={disabled}>
				<Icon name={pending ? "hourglass_top" : "save"} />
				{busy ? "Ada job berjalan" : pending ? "Menyimpan…" : "Simpan"}
			</button>
			<span className="cl-count">
				{busy
					? "Config tidak bisa diubah selagi build berjalan."
					: dirty === 0
						? "Belum ada perubahan."
						: `${dirty} nilai diubah.`}
			</span>
		</div>
	);
}

export default function ConfigForm({
	id,
	entries,
	busy,
}: {
	id: string;
	entries: Entry[];
	busy: boolean;
}) {
	const [values, setValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(entries.map((e) => [e.key, e.value])),
	);
	const dirty = entries.filter((e) => values[e.key] !== e.value).length;

	return (
		<form action={saveConfigAction} className="checklist">
			<input type="hidden" name="id" value={id} />
			<div className="cfg-list">
				{entries.map((e) => (
					<Row
						key={e.key}
						entry={e}
						value={values[e.key] ?? e.value}
						onChange={(v) => setValues((s) => ({ ...s, [e.key]: v }))}
					/>
				))}
			</div>
			<Save busy={busy} dirty={dirty} />
		</form>
	);
}
