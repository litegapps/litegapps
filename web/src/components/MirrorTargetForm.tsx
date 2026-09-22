"use client";

import { useFormStatus } from "react-dom";
import Icon from "./Icon";
import { saveMirrorAction } from "@/app/actions";

/*
 * Where the mirror writes: the rclone remote (as named in rclone.conf) and
 * the folder inside that Drive. Both also go through the same check in the
 * server action and again in web/gdrive-mirror.sh.
 */

function Save({ busy }: { busy: boolean }) {
	const { pending } = useFormStatus();
	return (
		<button className="btn tonal" type="submit" disabled={pending || busy}>
			<Icon name={pending ? "hourglass_top" : "save"} />
			{pending ? "Menyimpan…" : "Simpan tujuan"}
		</button>
	);
}

export default function MirrorTargetForm({
	remote,
	dir,
	remotes,
	busy,
}: {
	remote: string;
	dir: string;
	/** remote names found in rclone.conf; empty when no token is set up yet */
	remotes: string[];
	busy: boolean;
}) {
	return (
		<form action={saveMirrorAction} className="buildform">
			<div className="field">
				<label htmlFor="remote">Remote rclone</label>
				{remotes.length > 0 ? (
					<select id="remote" name="remote" defaultValue={remotes.includes(remote) ? remote : remotes[0]}>
						{remotes.map((r) => (
							<option key={r} value={r}>
								{r}
							</option>
						))}
					</select>
				) : (
					<input id="remote" name="remote" defaultValue={remote} spellCheck={false} />
				)}
			</div>
			<div className="field">
				<label htmlFor="dir">Folder di Drive</label>
				<input id="dir" name="dir" defaultValue={dir} spellCheck={false} />
			</div>
			<Save busy={busy} />
		</form>
	);
}
