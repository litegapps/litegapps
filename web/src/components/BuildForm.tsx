"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { startJobAction } from "@/app/actions";
import {
	ARCHS,
	GO_UNSUPPORTED_MSG,
	SDKS,
	UNSUPPORTED_MSG,
	VARIANTS,
	targetSupported,
	variantSupported,
} from "@/lib/targets";
import { useBusy } from "./useBusy";
import { useRemember } from "./useRemember";

type Kind = { id: string; label: string; needs: readonly string[] };

const KINDS: readonly Kind[] = [
	{ id: "make", label: "Build varian", needs: ["variant", "arch", "sdk"] },
	{ id: "packages", label: "Build packages", needs: ["arch", "sdk"] },
	{ id: "restore", label: "Restore", needs: [] },
	{ id: "status", label: "Segarkan status", needs: [] },
	{ id: "clean", label: "Clean", needs: [] },
];

function Submit({ busy: initialBusy, blocked }: { busy: boolean; blocked: boolean }) {
	const { pending } = useFormStatus();
	// Live: a job started elsewhere must disable this too.
	const busy = useBusy(initialBusy);
	const disabled = busy || pending || blocked;
	return (
		<button className="btn" type="submit" disabled={disabled}>
			<Icon name={disabled ? "hourglass_top" : "play_arrow"} />
			{busy ? "Ada job berjalan" : pending ? "Memulai…" : "Jalankan"}
		</button>
	);
}

export default function BuildForm({
	busy,
	back = "/",
	prefs,
}: {
	busy: boolean;
	back?: string;
	/** last used command and target, from the database */
	prefs: { kind: string; variant: string; arch: string; sdk: string };
}) {
	const [kind, setKind] = useState<string>(prefs.kind);
	const [variant, setVariant] = useState(prefs.variant);
	const [arch, setArch] = useState(prefs.arch);
	const [sdk, setSdk] = useState(prefs.sdk);

	useRemember("single", { kind, variant, arch, sdk });

	// Only commands that take a target can hit an unsupported one.
	const takesTarget = ["make", "packages"].includes(kind);
	const targetBlocked = takesTarget && !targetSupported(arch, sdk);
	const variantBlocked = kind === "make" && !variantSupported(variant, arch, sdk);
	const blocked = targetBlocked || variantBlocked;
	const needs = KINDS.find((k) => k.id === kind)?.needs ?? [];

	return (
		<form action={startJobAction} className="buildform">
			<input type="hidden" name="back" value={back} />
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
					<select
						id="variant"
						name="variant"
						value={variant}
						onChange={(e) => setVariant(e.target.value)}
					>
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
					<select id="arch" name="arch" value={arch} onChange={(e) => setArch(e.target.value)}>
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
					<select id="sdk" name="sdk" value={sdk} onChange={(e) => setSdk(e.target.value)}>
						{[...SDKS].reverse().map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
				</div>
			)}

			{blocked && (
				<p className="cl-hint" style={{ flexBasis: "100%", margin: 0 }}>
					{targetBlocked ? UNSUPPORTED_MSG : GO_UNSUPPORTED_MSG}.
				</p>
			)}
			<Submit busy={busy} blocked={blocked} />
		</form>
	);
}
