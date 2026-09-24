"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { saveRetentionAction } from "@/app/actions";

/*
 * Build > Settings: how many releases each variant keeps on SourceForge.
 * Flipping the switch saves at once; the count is saved with its button.
 */

function State({ on }: { on: boolean }) {
	const { pending } = useFormStatus();
	return (
		<span className={`pill ${pending ? "run" : on ? "ok" : "no"}`}>
			<Icon name={pending ? "sync" : on ? "check" : "close"} />
			{pending ? "menyimpan…" : on ? "aktif" : "mati"}
		</span>
	);
}

function Save() {
	const { pending } = useFormStatus();
	return (
		<button className="btn tonal" type="submit" disabled={pending}>
			<Icon name="save" />
			Simpan
		</button>
	);
}

export default function RetentionForm({
	on,
	keep,
	max,
}: {
	on: boolean;
	keep: number;
	max: number;
}) {
	const form = useRef<HTMLFormElement>(null);
	const [enabled, setEnabled] = useState(on);

	return (
		<form action={saveRetentionAction} ref={form} className="autoswitch">
			<label className="cl-switch toggle">
				<input
					type="checkbox"
					name="on"
					checked={enabled}
					onChange={(e) => {
						setEnabled(e.target.checked);
						// Wait for the checkbox to re-render before posting its value.
						setTimeout(() => form.current?.requestSubmit(), 0);
					}}
				/>
				<span>Batasi jumlah rilis per varian di SourceForge</span>
			</label>
			<State on={on} />
			<div className="field" style={{ flex: "1 1 100%", maxWidth: 260 }}>
				<label htmlFor="keep">Rilis terbaru yang disimpan per varian</label>
				<input
					id="keep"
					type="number"
					name="keep"
					min={1}
					max={max}
					defaultValue={keep}
					disabled={!enabled}
					required
				/>
			</div>
			{/* A disabled input is not posted; keep the stored count then. */}
			{!enabled && <input type="hidden" name="keep" value={keep} />}
			<Save />
		</form>
	);
}
