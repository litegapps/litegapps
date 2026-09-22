import Icon from "./Icon";
import type { Status } from "@/lib/status";
import { UNSUPPORTED_MSG, targetSupported, unsupportedReason } from "@/lib/targets";

/** A target the project no longer builds (x86 after SDK 35, arm after SDK 36). */
function Unsupported({ arch, sdk }: { arch: string; sdk: number }) {
	return (
		<span className="rel none" title={unsupportedReason(arch, sdk)}>
			—<span className="sr">tidak didukung</span>
		</span>
	);
}

function Pill({ on, tag }: { on: boolean; tag?: string }) {
	if (!on) {
		return (
			<span className="pill no">
				<Icon name="close" />
				<span className="sr">belum ada</span>
			</span>
		);
	}
	return (
		<>
			<span className="pill ok">
				<Icon name="check" />
				<span className="sr">sudah ada</span>
			</span>
			{tag && <span className="tag">{tag}</span>}
		</>
	);
}

function Matrix({ s, kind }: { s: Status; kind: "gapps" | "package" | "release" }) {
	return (
		<div className="tscroll">
			<table>
				<thead>
					<tr>
						<th className="ver">Android</th>
						{s.archs.map((a) => (
							<th key={a}>{a}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{s.sdks.map((sdk) => (
						<tr key={sdk.sdk}>
							<td className="ver">
								<b>{sdk.android}</b>
								<em>SDK {sdk.sdk}</em>
							</td>
							{s.archs.map((a) => {
								const t = s.targets[a]?.[String(sdk.sdk)];
								const supported = targetSupported(a, sdk.sdk);
								// Sources are never restored for a dropped target, so the
								// cell says why instead of "missing". Releases published
								// before the cut-off still show, marked.
								if (!supported && (kind !== "release" || !t?.release)) {
									return (
										<td key={a}>
											<Unsupported arch={a} sdk={sdk.sdk} />
										</td>
									);
								}
								if (!t) return <td key={a}>—</td>;
								if (kind === "gapps") {
									return (
										<td key={a}>
											<Pill on={t.gapps} tag={t.lite ? "LITE" : undefined} />
										</td>
									);
								}
								if (kind === "package") {
									return (
										<td key={a}>
											<Pill on={t.package} />
										</td>
									);
								}
								return (
									<td key={a}>
										{t.release ? (
											<span className="rel">
												<b>{t.release}</b>
												<em>{t.variants.length} varian</em>
												{!supported && (
													<span className="tag" title={unsupportedReason(a, sdk.sdk)}>
														TIDAK DIDUKUNG
													</span>
												)}
											</span>
										) : t.legacy ? (
											<span className="rel" title="Rilis lama tanpa folder tanggal">
												<b>{t.legacy}</b>
												<em>{t.legacy_variants?.length ?? 0} varian &middot; lama</em>
											</span>
										) : (
											<span className="rel none">—</span>
										)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default function StatusMatrix({ status }: { status: Status }) {
	return (
		<>
			<section className="card">
				<div className="card-head">
					<h2>
						<Icon name="folder_zip" />
						Gapps source
					</h2>
					<code>files-server/litegapps/&lt;arch&gt;/&lt;sdk&gt;/&lt;sdk&gt;.zip</code>
				</div>
				<Matrix s={status} kind="gapps" />
				<div className="legend">
					<span className="item">
						<span className="pill ok">
							<Icon name="check" />
						</span>{" "}
						sudah ada
					</span>
					<span className="item">
						<span className="pill no">
							<Icon name="close" />
						</span>{" "}
						belum ada
					</span>
					<span className="item">
						<span className="tag">LITE</span> varian <code>-lite.zip</code> juga tersedia
					</span>
					<span className="item">
						<span className="rel none">—</span> tidak didukung: {UNSUPPORTED_MSG}
					</span>
				</div>
			</section>

			<section className="card">
				<div className="card-head">
					<h2>
						<Icon name="inventory_2" />
						Package source
					</h2>
					<code>files-server/package/&lt;arch&gt;/&lt;sdk&gt;.zip</code>
				</div>
				<Matrix s={status} kind="package" />
				<div className="legend">
					<span className="item">
						<span className="rel none">—</span> tidak didukung: {UNSUPPORTED_MSG}
					</span>
				</div>
			</section>

			<section className="card">
				<div className="card-head">
					<h2>
						<Icon name="event" />
						Rilis terpublikasi
					</h2>
					<code>litegapps/&lt;arch&gt;/&lt;sdk&gt;/&lt;varian&gt;/&lt;tanggal&gt;/</code>
				</div>
				<Matrix s={status} kind="release" />
				<div className="legend">
					<span className="item">
						Tanggal build terbaru yang sudah ada di server, beserta jumlah varian pada tanggal itu.
						Target yang hanya punya rilis lama (sebelum ada folder tanggal) menampilkan versinya,
						misalnya <b>v2.5</b>.
						Rilis lama dari target yang sudah tidak didukung tetap ditampilkan dengan tanda{" "}
						<span className="tag">TIDAK DIDUKUNG</span>.
					</span>
					<span className="item">
						<span className="rel none">—</span> tidak didukung: {UNSUPPORTED_MSG}
					</span>
				</div>
			</section>
		</>
	);
}
