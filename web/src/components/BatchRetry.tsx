"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import Icon from "./Icon";
import { retryBatchAction } from "@/app/actions";
import type { RetryItem } from "@/lib/batchlog";

/*
 * Retry under a finished batch build's progress table: one chip per failed
 * build, addon or upload (all ticked), and a button that restores those
 * targets anew and builds them again as a new batch job. The server checks
 * every ticked item against the old job's log, so nothing else can be asked.
 */

function Submit({ count }: { count: number }) {
	const { pending } = useFormStatus();
	return (
		<button className="btn" type="submit" disabled={pending || count === 0}>
			<Icon name={pending ? "hourglass_top" : "replay"} />
			Restore &amp; build ulang ({count})
		</button>
	);
}

function label(i: RetryItem): string {
	const at = `${i.arch}/${i.sdk}`;
	if (i.step === "addon") return `addon ${at}`;
	if (i.step === "upload") return `upload ${at}`;
	return `${i.variant} ${at}`;
}

export default function BatchRetry({
	jobId,
	items,
	upload,
	clean,
}: {
	jobId: number;
	items: RetryItem[];
	/** the first run released to SourceForge, so the retry does too by default */
	upload: boolean;
	/** the first run deleted each target's sources after it, same default here */
	clean: boolean;
}) {
	const params = useSearchParams();
	const pathname = usePathname();
	const [picked, setPicked] = useState(() => new Set(items.map((i) => i.key)));

	// Back to the tab this table sits on (Multi or Auto).
	const tab = params.get("tab");
	const back = pathname + (tab ? `?tab=${tab}` : "");

	const toggle = (key: string) =>
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const count = items.filter((i) => picked.has(i.key)).length;
	const unfinished = items.some((i) => i.unfinished);

	return (
		<form action={retryBatchAction} className="checklist" style={{ paddingTop: 12 }}>
			<input type="hidden" name="job" value={jobId} />
			<input type="hidden" name="back" value={back} />

			<div className="cl-group">
				<div className="cl-head">
					<span>
						Ulangi yang {unfinished ? "gagal / belum selesai" : "gagal"} ({count}/{items.length})
					</span>
					<span>
						<button className="btn text" type="button" onClick={() => setPicked(new Set(items.map((i) => i.key)))}>
							Pilih semua
						</button>
						<button className="btn text" type="button" onClick={() => setPicked(new Set())}>
							Kosongkan
						</button>
					</span>
				</div>
				<div className="chips">
					{items.map((i) => (
						<label key={i.key} className={`chip ${picked.has(i.key) ? "on" : ""}`} title={i.why}>
							<input
								type="checkbox"
								name="item"
								value={i.key}
								checked={picked.has(i.key)}
								onChange={() => toggle(i.key)}
							/>
							<span className="chip-main">{label(i)}</span>
							<span className="chip-sub">{i.why}</span>
						</label>
					))}
				</div>
			</div>

			<label className="cl-switch">
				<input type="checkbox" name="upload" defaultChecked={upload} />
				<span>Upload ke SourceForge setelah berhasil (seperti run pertama)</span>
			</label>
			<label className="cl-switch">
				<input type="checkbox" name="cleanAfter" defaultChecked={clean} />
				<span>Hapus source tiap target setelah selesai (seperti run pertama)</span>
			</label>

			<div className="cl-foot">
				<Submit count={count} />
				<span className="cl-count">
					Source target-nya dihapus dulu lalu di-restore ulang, kemudian hanya yang dipilih yang
					dibangun lagi — sebagai job baru.
				</span>
			</div>
		</form>
	);
}
