"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { saveSourceAction } from "@/app/actions";

/*
 * Build > Settings: where restores download sources from. Saved as soon as a
 * choice is picked; applies to jobs started afterwards.
 */

function State() {
	const { pending } = useFormStatus();
	return pending ? (
		<span className="pill run">
			<Icon name="sync" />
			menyimpan…
		</span>
	) : null;
}

export default function SourceForm({
	prefer,
	mirrorReady,
}: {
	prefer: "sf" | "drive";
	/** the Drive mirror has a token and a file list */
	mirrorReady: boolean;
}) {
	const form = useRef<HTMLFormElement>(null);
	const [value, setValue] = useState(prefer);
	const pick = (v: "sf" | "drive") => {
		setValue(v);
		setTimeout(() => form.current?.requestSubmit(), 0);
	};

	return (
		<form action={saveSourceAction} ref={form} className="autoswitch" style={{ flexDirection: "column", alignItems: "stretch" }}>
			<label className="cl-switch">
				<input type="radio" name="prefer" value="sf" checked={value === "sf"} onChange={() => pick("sf")} />
				<span>
					<b>SourceForge</b> — seperti biasa, langsung dari <code>files-server/</code> di SourceForge.
				</span>
			</label>
			<label className="cl-switch">
				<input
					type="radio"
					name="prefer"
					value="drive"
					checked={value === "drive"}
					onChange={() => pick("drive")}
					disabled={!mirrorReady && value !== "drive"}
				/>
				<span>
					<b>Google Drive</b> — dari mirror di menu Mirror source; file yang tidak ada di sana atau
					gagal diunduh otomatis diambil dari SourceForge.
					{!mirrorReady && " (Mirror belum siap: buat token dan jalankan Cek mirror dulu.)"}
				</span>
			</label>
			<State />
		</form>
	);
}
