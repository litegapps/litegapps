"use client";

import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { ARCHS, SDKS } from "@/lib/targets";
import { useBusy } from "./useBusy";

/*
 * Small client pieces of the Restore page. The page itself stays a server
 * component; these only add what needs the browser: jumping to another
 * target on select, pending state on submit, and a confirm before deleting.
 */

export function TargetPicker({ tab, arch, sdk }: { tab: string; arch: string; sdk: number }) {
	const router = useRouter();
	const go = (a: string, s: string | number) =>
		router.push(`/restore?tab=${tab}&arch=${a}&sdk=${s}`);

	return (
		<div className="buildform">
			<div className="field">
				<label htmlFor="r-arch">Arsitektur</label>
				<select id="r-arch" value={arch} onChange={(e) => go(e.target.value, sdk)}>
					{ARCHS.map((a) => (
						<option key={a} value={a}>
							{a}
						</option>
					))}
				</select>
			</div>
			<div className="field">
				<label htmlFor="r-sdk">SDK</label>
				<select id="r-sdk" value={sdk} onChange={(e) => go(arch, e.target.value)}>
					{[...SDKS].reverse().map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

export function RunButton({
	busy: initialBusy,
	blocked = false,
	blockedLabel = "Tidak didukung",
	icon = "download",
	label,
	tone,
	confirmText,
}: {
	busy: boolean;
	/** the action is not allowed at all here (e.g. an unsupported target) */
	blocked?: boolean;
	/** what the button says while blocked; the default is about targets */
	blockedLabel?: string;
	icon?: string;
	label: string;
	tone?: "tonal";
	confirmText?: string;
}) {
	const { pending } = useFormStatus();
	// Live, so a job started elsewhere disables this button without a reload.
	const busy = useBusy(initialBusy);
	const disabled = busy || pending || blocked;
	return (
		<button
			className={tone ? `btn ${tone}` : "btn"}
			title={busy ? "Ada job berjalan - tunggu sampai selesai" : undefined}
			type="submit"
			disabled={disabled}
			onClick={(e) => {
				if (confirmText && !window.confirm(confirmText)) e.preventDefault();
			}}
		>
			<Icon name={blocked ? "block" : pending || busy ? "hourglass_top" : icon} />
			{blocked ? blockedLabel : pending ? "Memulai…" : busy ? "Ada job berjalan" : label}
		</button>
	);
}
