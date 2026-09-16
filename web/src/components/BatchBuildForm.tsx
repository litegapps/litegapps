"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { startJobAction } from "@/app/actions";
import {
	ANDROID,
	ARCHS,
	SDKS,
	UNSUPPORTED_MSG,
	defaultVariants,
	targetSupported,
} from "@/lib/targets";
import { useBusy } from "./useBusy";
import { useRemember } from "./useRemember";

/*
 * Checklist build: tick the arch x Android targets in the matrix and every one
 * of them is queued into a single batch job (web/build-batch.sh). Kept to one
 * job because builds share output/ and log/, so the panel's single-job lock
 * still holds while a "build everything" run is going.
 *
 * The matrix mirrors Build > Config target, which is also where each target's
 * variants come from: nothing about variants is chosen here.
 */

type Props = {
	busy: boolean;
	/** last used selection, from the database */
	prefs: {
		targets: string[];
		restoreMissing: boolean;
		cleanAfter: boolean;
		buildAddon: boolean;
		upload: boolean;
	};
	/** per-target variants from the panel's config; the rest follow the default */
	overrides: Record<string, string[]>;
	/** "<arch>-<sdk>" -> gapps zip exists on the release server (status.json) */
	serverGapps: Record<string, boolean>;
	/** "<arch>-<sdk>" -> variants already restored in this checkout */
	localGapps: Record<string, string[]>;
};

function Submit({ busy: initialBusy, count }: { busy: boolean; count: number }) {
	const { pending } = useFormStatus();
	const busy = useBusy(initialBusy);
	const disabled = busy || pending || count === 0;
	return (
		<button className="btn" type="submit" disabled={disabled}>
			<Icon name={disabled ? "hourglass_top" : "play_arrow"} />
			{busy
				? "Ada job berjalan"
				: pending
					? "Memulai…"
					: count === 0
						? "Pilih target dulu"
						: `Build ${count} zip`}
		</button>
	);
}

export default function BatchBuildForm({
	busy,
	prefs,
	overrides,
	serverGapps,
	localGapps,
}: Props) {
	const [picked, setPicked] = useState<string[]>(
		prefs.targets.filter((k) => {
			const i = k.lastIndexOf("-");
			return targetSupported(k.slice(0, i), Number(k.slice(i + 1)));
		}),
	);
	const [opts, setOpts] = useState({
		restoreMissing: prefs.restoreMissing,
		cleanAfter: prefs.cleanAfter,
		buildAddon: prefs.buildAddon,
		upload: prefs.upload,
	});
	const setOpt = (k: keyof typeof opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));

	// Ticking a box is enough: leaving for another menu must not lose it.
	useRemember("batch", { targets: picked, ...opts });

	const key = (a: string, s: number) => `${a}-${s}`;
	const configured = (a: string, s: number) => overrides[key(a, s)] ?? defaultVariants(a, s);
	const on = (a: string, s: number) => picked.includes(key(a, s));

	const toggle = (a: string, s: number) =>
		setPicked((cur) =>
			cur.includes(key(a, s)) ? cur.filter((k) => k !== key(a, s)) : [...cur, key(a, s)],
		);

	/** Tick or clear a whole Android row / arch column at once. */
	const setMany = (keys: string[], next: boolean) =>
		setPicked((cur) => (next ? [...new Set([...cur, ...keys])] : cur.filter((k) => !keys.includes(k))));

	// Row, column and "select all" only ever reach supported targets.
	const rowKeys = (s: number) => ARCHS.filter((a) => targetSupported(a, s)).map((a) => key(a, s));
	const colKeys = (a: string) => SDKS.filter((s) => targetSupported(a, s)).map((s) => key(a, s));
	const allKeys = ARCHS.flatMap((a) => colKeys(a));

	const targets = picked
		.map((k) => {
			const i = k.lastIndexOf("-");
			return { arch: k.slice(0, i), sdk: Number(k.slice(i + 1)) };
		})
		.filter((t) => (ARCHS as readonly string[]).includes(t.arch))
		.sort((x, y) => x.arch.localeCompare(y.arch) || y.sdk - x.sdk);

	const count = targets.reduce((n, t) => n + configured(t.arch, t.sdk).length, 0);

	return (
		<form action={startJobAction} className="checklist">
			<input type="hidden" name="kind" value="build-batch" />
			{picked.map((k) => (
				<input key={k} type="hidden" name="targets" value={k} />
			))}

			<div className="cl-group">
				<div className="cl-head">
					<span>Target</span>
					<button
						type="button"
						className="btn text"
						onClick={() => setMany(allKeys, picked.length !== allKeys.length)}
					>
						{picked.length === allKeys.length ? "Kosongkan" : "Pilih semua"}
					</button>
				</div>

				<div className="tscroll">
					<table className="jobs targetcfg">
						<thead>
							<tr>
								<th>Android</th>
								{ARCHS.map((a) => (
									<th key={a}>
										<button
											type="button"
											className="joblink"
											title={`Pilih semua ${a}`}
											onClick={() =>
												setMany(colKeys(a), !colKeys(a).every((k) => picked.includes(k)))
											}
										>
											{a}
										</button>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{[...SDKS].reverse().map((s) => {
								const rowOn = rowKeys(s).every((k) => picked.includes(k));
								return (
									<tr key={s}>
										<td className="lbl">
											<button
												type="button"
												className="joblink"
												title="Pilih semua arsitektur untuk versi ini"
												onClick={() => setMany(rowKeys(s), !rowOn)}
											>
												<b>{ANDROID[s] ?? s}</b> <small>SDK {s}</small>
											</button>
										</td>
										{ARCHS.map((a) =>
											targetSupported(a, s) ? (
												<td key={a}>
													<input
														type="checkbox"
														aria-label={`${a} Android ${ANDROID[s] ?? s}`}
														checked={on(a, s)}
														onChange={() => toggle(a, s)}
													/>
												</td>
											) : (
												<td key={a} className="when" title={UNSUPPORTED_MSG}>
													—
												</td>
											),
										)}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
				<p className="cl-hint">
					Tanda — berarti target tidak didukung: {UNSUPPORTED_MSG}. Klik nama arsitektur atau
					versi Android untuk mencentang satu kolom/baris sekaligus. Varian
					tiap target diambil dari tab <b>Config target</b> — hasil akhirnya ada di tabel di bawah.
				</p>
			</div>

			<div className="cl-group">
				<div className="cl-head">
					<span>Opsi</span>
				</div>
				<label className="cl-switch">
					<input
						type="checkbox"
						name="restoreMissing"
						checked={opts.restoreMissing}
						onChange={() => setOpt("restoreMissing")}
					/>
					<span>Restore source otomatis kalau belum ada di VPS</span>
				</label>
				<label className="cl-switch">
					<input
						type="checkbox"
						name="buildAddon"
						checked={opts.buildAddon}
						onChange={() => setOpt("buildAddon")}
					/>
					<span>Build paket addon tiap target lebih dulu (packages/make make)</span>
				</label>
				<label className="cl-switch">
					<input
						type="checkbox"
						name="upload"
						checked={opts.upload}
						onChange={() => setOpt("upload")}
					/>
					<span>
						Rilis hasilnya ke SourceForge: addon ke <code>addon/&lt;arch&gt;/&lt;sdk&gt;</code>, zip ke{" "}
						<code>litegapps/&lt;arch&gt;/&lt;sdk&gt;</code>
					</span>
				</label>
				<label className="cl-switch">
					<input
						type="checkbox"
						name="cleanAfter"
						checked={opts.cleanAfter}
						onChange={() => setOpt("cleanAfter")}
					/>
					<span>Hapus source tiap target setelah selesai (hemat disk)</span>
				</label>
			</div>

			<div className="cl-foot">
				<Submit busy={busy} count={count} />
				<span className="cl-count">
					{targets.length} target &middot; {count} zip
				</span>
			</div>

			{targets.length > 0 && (
				<div className="tscroll">
					<table className="jobs">
						<thead>
							<tr>
								<th>Target</th>
								<th>Varian</th>
								<th>Source</th>
							</tr>
						</thead>
						<tbody>
							{targets.slice(0, 40).map((t) => {
								const k = key(t.arch, t.sdk);
								const list = configured(t.arch, t.sdk);
								const local = localGapps[k] ?? [];
								const missing = list.filter((v) => !local.includes(v));
								return (
									<tr key={k}>
										<td>
											<b>{t.arch}</b> · Android {ANDROID[t.sdk] ?? t.sdk}
										</td>
										<td className="lbl">{list.join(", ") || "tidak dibangun"}</td>
										<td>
											{missing.length === 0 ? (
												<span className="pill ok">
													<Icon name="check" />
													siap di VPS
												</span>
											) : serverGapps[k] ? (
												<span className="pill run">
													<Icon name="cloud_download" />
													unduh {missing.length} varian
												</span>
											) : (
												<span className="pill no">
													<Icon name="close" />
													tidak ada di server
												</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{targets.length > 40 && (
						<p className="cl-hint">… dan {targets.length - 40} target lagi.</p>
					)}
				</div>
			)}
		</form>
	);
}
