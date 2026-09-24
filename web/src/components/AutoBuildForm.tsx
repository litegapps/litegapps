"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { saveAutoBuildAction } from "@/app/actions";
import { ANDROID, defaultVariants, targetSupported } from "@/lib/targets";

/*
 * Build > Auto: the monthly auto build switch. Flipping it saves at once;
 * the day and hour save with their button. What it builds is not chosen here:
 * it is whatever the Auto tab's own checklist below has ticked when the day comes
 * (targets and options), with Config target's variants and Build > Settings'
 * restore source and retention.
 */

function Save() {
	const { pending } = useFormStatus();
	return (
		<button className="btn tonal" type="submit" disabled={pending}>
			<Icon name={pending ? "hourglass_top" : "save"} />
			{pending ? "Menyimpan…" : "Simpan jadwal"}
		</button>
	);
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function AutoBuildForm({
	on,
	day,
	hour,
	last,
	prefs,
	overrides,
	source,
	timeZone,
}: {
	on: boolean;
	day: number;
	hour: number;
	/** YYYY-MM of the last auto build, "" when never */
	last: string;
	/** the Auto tab checklist (its own list), which the auto build follows */
	prefs: { targets: string[]; restoreMissing: boolean; cleanAfter: boolean; buildAddon: boolean; upload: boolean };
	/** Config target's per-target variants */
	overrides: Record<string, string[]>;
	source: "sf" | "drive";
	timeZone: string;
}) {
	const targets = prefs.targets.filter((k) => {
		const i = k.lastIndexOf("-");
		return targetSupported(k.slice(0, i), Number(k.slice(i + 1)));
	});
	const zips = targets.reduce((n, k) => {
		const i = k.lastIndexOf("-");
		return n + (overrides[k] ?? defaultVariants(k.slice(0, i), Number(k.slice(i + 1)))).length;
	}, 0);
	const opts = [
		prefs.restoreMissing && "restore",
		prefs.buildAddon && "addon",
		prefs.upload && "rilis ke SourceForge",
		prefs.cleanAfter && "hapus source",
	].filter(Boolean);
	const sample = targets.slice(0, 6).map((k) => {
		const i = k.lastIndexOf("-");
		const s = Number(k.slice(i + 1));
		return `${k.slice(0, i)} ${ANDROID[s] ?? s}`;
	});
	const form = useRef<HTMLFormElement>(null);
	const [enabled, setEnabled] = useState(on);

	return (
		<form action={saveAutoBuildAction} ref={form} className="autobuild">
			<label className="cl-switch toggle">
				<input
					type="checkbox"
					name="on"
					checked={enabled}
					onChange={(e) => {
						setEnabled(e.target.checked);
						setTimeout(() => form.current?.requestSubmit(), 0);
					}}
				/>
				<span>
					<b>Auto build bulanan</b> — tiap tanggal {day} jam {pad(hour)}:00, mengikuti checklist Auto di
					bawah: {targets.length} target, {zips} zip
				</span>
				<span className={`pill ${on ? "ok" : "no"}`}>
					<Icon name={on ? "check" : "close"} />
					{on ? "aktif" : "mati"}
				</span>
			</label>

			<div className="buildform" style={{ padding: 0 }}>
				<div className="field">
					<label htmlFor="ab-day">Tanggal</label>
					<select id="ab-day" name="day" defaultValue={day}>
						{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
							<option key={d} value={d}>
								{d}
							</option>
						))}
					</select>
				</div>
				<div className="field">
					<label htmlFor="ab-hour">Jam</label>
					<select id="ab-hour" name="hour" defaultValue={hour}>
						{Array.from({ length: 24 }, (_, i) => i).map((h) => (
							<option key={h} value={h}>
								{pad(h)}:00
							</option>
						))}
					</select>
				</div>
				{/* the switch itself is posted with the schedule too */}
				{enabled && <input type="hidden" name="keepOn" value="1" />}
				<Save />
			</div>

			{targets.length === 0 && (
				<p className="cl-hint" style={{ margin: 0, color: "var(--md-error)" }}>
					Belum ada target yang dicentang di checklist Auto - auto build bulan itu akan dilewati.
				</p>
			)}
			<p className="cl-hint" style={{ margin: 0 }}>
				Yang dibangun adalah centang biru di bawah saat jadwal tiba
				{sample.length > 0 && ` (${sample.join(", ")}${targets.length > sample.length ? ", …" : ""})`},
				dengan opsi <b>{opts.length ? opts.join(", ") : "tanpa opsi"}</b>. Varian tiap target mengikuti
				Config target; source diambil dari{" "}
				<b>{source === "drive" ? "Google Drive (cadangan SourceForge)" : "SourceForge"}</b> dan retensi
				rilis mengikuti Build &rarr; Settings. Waktu server ({timeZone}). Kalau ada job lain berjalan saat
				jadwal tiba, auto build menunggu sampai selesai.{" "}
				{last ? `Terakhir berjalan: ${last}.` : "Belum pernah berjalan."}
			</p>
		</form>
	);
}
