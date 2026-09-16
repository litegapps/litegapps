"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { startJobAction } from "@/app/actions";
import { ANDROID, ARCHS, SDKS, VARIANTS, defaultVariants } from "@/lib/targets";
import { useBusy } from "./useBusy";
import { useRemember } from "./useRemember";

/*
 * Checklist build: tick architectures and Android versions, and every
 * combination is queued into one batch job (web/build-batch.sh). Kept to one
 * job because builds share output/ and log/, so the panel's single-job lock
 * still holds while a "build everything" run is going.
 */

type Props = {
	busy: boolean;
	/** last used selection, from the database */
	prefs: {
		archs: string[];
		sdks: number[];
		auto: boolean;
		variants: string[];
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

function Chip({
	checked,
	onChange,
	disabled,
	title,
	main,
	sub,
}: {
	checked: boolean;
	onChange: () => void;
	disabled?: boolean;
	title?: string;
	main: string;
	sub?: string;
}) {
	return (
		<label className={`chip${checked ? " on" : ""}${disabled ? " off" : ""}`} title={title}>
			<input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
			<span className="chip-main">{main}</span>
			{sub && <span className="chip-sub">{sub}</span>}
		</label>
	);
}

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

export default function BatchBuildForm({ busy, prefs, overrides, serverGapps, localGapps }: Props) {
	const configured = (a: string, s: number) => overrides[`${a}-${s}`] ?? defaultVariants(a, s);
	// Seeded from the last run; the page is dynamic, so this is the server's
	// value on both renders and cannot mismatch on hydration.
	const [archs, setArchs] = useState<string[]>(prefs.archs);
	const [sdks, setSdks] = useState<number[]>(prefs.sdks);
	const [auto, setAuto] = useState(prefs.auto);
	const [variants, setVariants] = useState<string[]>(prefs.variants);
	const [opts, setOpts] = useState({
		restoreMissing: prefs.restoreMissing,
		cleanAfter: prefs.cleanAfter,
		buildAddon: prefs.buildAddon,
		upload: prefs.upload,
	});
	const setOpt = (k: keyof typeof opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));

	// Ticking a box is enough: leaving for another menu must not lose it.
	useRemember("batch", { archs, sdks, auto, variants, ...opts });

	const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) =>
		set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

	const targets = archs.flatMap((a) => sdks.map((s) => ({ arch: a, sdk: s })));
	const count = targets.reduce(
		(n, t) => n + (auto ? configured(t.arch, t.sdk).length : variants.length),
		0,
	);
	targets.sort((x, y) => x.arch.localeCompare(y.arch) || y.sdk - x.sdk);

	return (
		<form action={startJobAction} className="checklist">
			<input type="hidden" name="kind" value="build-batch" />
			{archs.map((a) => (
				<input key={a} type="hidden" name="archs" value={a} />
			))}
			{sdks.map((s) => (
				<input key={s} type="hidden" name="sdks" value={s} />
			))}
			{!auto && variants.map((v) => <input key={v} type="hidden" name="variants" value={v} />)}
			{auto && <input type="hidden" name="autoVariants" value="on" />}

			<div className="cl-group">
				<div className="cl-head">
					<span>Arsitektur</span>
					<button
						type="button"
						className="btn text"
						onClick={() => setArchs(archs.length === ARCHS.length ? [] : [...ARCHS])}
					>
						{archs.length === ARCHS.length ? "Kosongkan" : "Pilih semua"}
					</button>
				</div>
				<div className="chips">
					{ARCHS.map((a) => (
						<Chip
							key={a}
							main={a}
							checked={archs.includes(a)}
							onChange={() => toggle(archs, a, setArchs)}
						/>
					))}
				</div>
			</div>

			<div className="cl-group">
				<div className="cl-head">
					<span>Android</span>
					<button
						type="button"
						className="btn text"
						onClick={() => setSdks(sdks.length === SDKS.length ? [] : [...SDKS])}
					>
						{sdks.length === SDKS.length ? "Kosongkan" : "Pilih semua"}
					</button>
				</div>
				<div className="chips">
					{[...SDKS].reverse().map((s) => (
						<Chip
							key={s}
							main={ANDROID[s] ?? String(s)}
							sub={`SDK ${s}`}
							checked={sdks.includes(s)}
							onChange={() => toggle(sdks, s, setSdks)}
						/>
					))}
				</div>
			</div>

			<div className="cl-group">
				<div className="cl-head">
					<span>Varian</span>
					<label className="cl-switch">
						<input type="checkbox" checked={auto} onChange={() => setAuto(!auto)} />
						<span>Ikut config target</span>
					</label>
				</div>
				<div className="chips">
					{VARIANTS.map((v) => (
						<Chip
							key={v}
							main={v}
							disabled={auto}
							checked={auto ? false : variants.includes(v)}
							onChange={() => toggle(variants, v, setVariants)}
						/>
					))}
				</div>
				{auto && (
					<p className="cl-hint">
						Varian diambil per target dari tab <b>Config target</b>. Target yang belum diatur di sana
						memakai daftar bawaan: arm64 SDK ≤28 core+lite, arm64 SDK 29+ pixel+lite+superlite,
						arm/x86/x86_64 core (+superlite SDK 29+).
					</p>
				)}
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
								const key = `${t.arch}-${t.sdk}`;
								const list = auto ? configured(t.arch, t.sdk) : variants;
								const local = localGapps[key] ?? [];
								const missing = list.filter((v) => !local.includes(v));
								return (
									<tr key={key}>
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
											) : serverGapps[key] ? (
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
