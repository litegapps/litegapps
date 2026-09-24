"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { toggleAutoBackupAction } from "@/app/actions";

/*
 * On/off switch for the daily backup. Submits the form as soon as it is
 * flipped, so there is no second "save" step to forget.
 */

function State({ on }: { on: boolean }) {
	const { pending } = useFormStatus();
	return (
		<span className={`pill ${pending ? "run" : on ? "ok" : "no"}`}>
			<Icon name={pending ? "sync" : on ? "check" : "close"} />
			{pending ? "menyimpan…" : on ? "aktif" : "mati"}
		</span>
	);
}

export default function AutoBackupSwitch({ on, hour }: { on: boolean; hour: number }) {
	const form = useRef<HTMLFormElement>(null);

	return (
		<form action={toggleAutoBackupAction} ref={form} className="autoswitch">
			<label className="cl-switch toggle">
				<input
					type="checkbox"
					name="on"
					defaultChecked={on}
					onChange={() => form.current?.requestSubmit()}
				/>
				<span>
					Backup otomatis sekali sehari, jam {String(hour).padStart(2, "0")}:00 waktu server
				</span>
			</label>
			<State on={on} />
			{/* Without JavaScript the switch still works through this button. */}
			<noscript>
				<button className="btn tonal" type="submit">
					Simpan
				</button>
			</noscript>
		</form>
	);
}
