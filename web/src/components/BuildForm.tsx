"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { startJobAction } from "@/app/actions";
import { ARCHS, SDKS, VARIANTS } from "@/lib/targets";

type Kind = { id: string; label: string; needs: readonly string[] };

const KINDS: readonly Kind[] = [
	{ id: "make", label: "Build varian", needs: ["variant", "arch", "sdk"] },
	{ id: "packages", label: "Build packages", needs: ["arch", "sdk"] },
	{ id: "restore", label: "Restore", needs: [] },
	{ id: "status", label: "Segarkan status", needs: [] },
	{ id: "clean", label: "Clean", needs: [] },
];

function Submit({ busy }: { busy: boolean }) {
	const { pending } = useFormStatus();
	const disabled = busy || pending;
	return (
		<button className="btn" type="submit" disabled={disabled}>
			<Icon name={disabled ? "hourglass_top" : "play_arrow"} />
			{busy ? "Ada job berjalan" : pending ? "Memulai…" : "Jalankan"}
		</button>
	);
}

export default function BuildForm({ busy }: { busy: boolean }) {
	const [kind, setKind] = useState<string>("make");
	const needs = KINDS.find((k) => k.id === kind)?.needs ?? [];

	return (
		<form action={startJobAction} className="buildform">
			<div className="field">
				<label htmlFor="kind">Perintah</label>
				<select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
					{KINDS.map((k) => (
						<option key={k.id} value={k.id}>
							{k.label}
						</option>
					))}
				</select>
			</div>

			{needs.includes("variant") && (
				<div className="field">
					<label htmlFor="variant">Varian</label>
					<select id="variant" name="variant" defaultValue="lite">
						{VARIANTS.map((v) => (
							<option key={v} value={v}>
								{v}
							</option>
						))}
					</select>
				</div>
			)}

			{needs.includes("arch") && (
				<div className="field">
					<label htmlFor="arch">Arsitektur</label>
					<select id="arch" name="arch" defaultValue="arm64">
						{ARCHS.map((a) => (
							<option key={a} value={a}>
								{a}
							</option>
						))}
					</select>
				</div>
			)}

			{needs.includes("sdk") && (
				<div className="field">
					<label htmlFor="sdk">SDK</label>
					<select id="sdk" name="sdk" defaultValue="36">
						{[...SDKS].reverse().map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
				</div>
			)}

			<Submit busy={busy} />
		</form>
	);
}
