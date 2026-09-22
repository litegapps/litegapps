"use client";

import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { clearBuildDataAction } from "@/app/actions";
import { useBusy } from "./useBusy";

/*
 * "Bersihkan data" for one build tab: drops that tab's job history and logs,
 * then runs web/clear-output.sh to delete the built zips and build logs too.
 * Destructive and not undoable, so it names what goes before it runs.
 */

function Submit({ busy: initialBusy }: { busy: boolean }) {
	const { pending } = useFormStatus();
	const busy = useBusy(initialBusy);
	return (
		<button
			className="btn danger"
			type="submit"
			disabled={busy || pending}
			title={busy ? "Ada job berjalan - tunggu sampai selesai" : undefined}
			onClick={(e) => {
				const ok = window.confirm(
					"Bersihkan data build?\n\n" +
						"Yang dihapus:\n" +
						"· riwayat job dan log di tab ini\n" +
						"· semua zip hasil build di output/ dan packages/output/\n" +
						"· log build di log/\n\n" +
						"Zip yang belum diunggah ke SourceForge ikut hilang dan tidak bisa dikembalikan.\n" +
						"Source gapps di bin/ dan core/ tetap aman.",
				);
				if (!ok) e.preventDefault();
			}}
		>
			<Icon name={pending || busy ? "hourglass_top" : "delete_sweep"} />
			{pending ? "Membersihkan…" : busy ? "Ada job berjalan" : "Bersihkan data & log"}
		</button>
	);
}

export default function ClearDataButton({
	group,
	back,
	busy,
}: {
	/** which tab's history goes: "batch" (Multi) or "single" (Single) */
	group: "batch" | "single";
	back: string;
	busy: boolean;
}) {
	return (
		<form action={clearBuildDataAction} className="actions">
			<input type="hidden" name="group" value={group} />
			<input type="hidden" name="back" value={back} />
			<Submit busy={busy} />
			<span className="cl-hint" style={{ margin: 0 }}>
				Hapus riwayat + log tab ini, zip di <code>output/</code>,{" "}
				<code>packages/output/</code> dan log build di <code>log/</code>. Source tidak dihapus.
			</span>
		</form>
	);
}
