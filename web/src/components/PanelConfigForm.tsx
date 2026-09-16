"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { savePanelConfigAction } from "@/app/actions";

/*
 * Identity and version for builds made on this VPS. They are stored in the
 * panel database and passed to the build as LG_CFG_*, so the repository's
 * `config` stays a neutral default that anyone can clone and build with.
 */

type Props = {
	/** stored values; a key that is absent falls back to the repo config */
	values: Record<string, string>;
	/** what the repo config says, shown as the placeholder */
	repo: Record<string, string>;
	keys: readonly string[];
	labels: Record<string, string>;
	hints: Record<string, string>;
};

function Save({ dirty }: { dirty: boolean }) {
	const { pending } = useFormStatus();
	return (
		<div className="cl-foot">
			<button className="btn" type="submit" disabled={pending || !dirty}>
				<Icon name={pending ? "hourglass_top" : "save"} />
				{pending ? "Menyimpan…" : "Simpan identitas"}
			</button>
			<span className="cl-count">
				{dirty ? "Ada perubahan." : "Kosongkan sebuah isian untuk memakai nilai dari config repo."}
			</span>
		</div>
	);
}

export default function PanelConfigForm({ values, repo, keys, labels, hints }: Props) {
	const initial = Object.fromEntries(keys.map((k) => [k, values[k] ?? ""]));
	const [text, setText] = useState<Record<string, string>>(initial);
	const dirty = keys.some((k) => text[k] !== initial[k]);

	return (
		<form action={savePanelConfigAction} className="checklist">
			<div className="cfg-list">
				{keys.map((k) => (
					<div className="cfg-row" key={k}>
						<div className="cfg-label">
							<code>{k}</code>
							<span className="cfg-hint">{hints[k]}</span>
						</div>
						<div className="cfg-control">
							<input
								type="text"
								name={`cfg:${k}`}
								value={text[k]}
								placeholder={`config repo: ${repo[k] || "(kosong)"}`}
								onChange={(e) => setText((s) => ({ ...s, [k]: e.target.value }))}
								aria-label={labels[k] ?? k}
							/>
						</div>
					</div>
				))}
			</div>
			<Save dirty={dirty} />
		</form>
	);
}
