"use client";

import { useEffect, useState, type ReactNode } from "react";
import Icon from "./Icon";

/*
 * A section of a form that folds away, like a drawer.
 *
 * The build forms are matrices - 14 Android versions x 4 architectures, or 9
 * variants per target - and three of them stacked fill the screen before the
 * Build button is even visible. Folding one leaves a single line with its
 * summary, and the choice is remembered per browser so the panel reopens the
 * way it was left.
 */

export default function Fold({
	id,
	title,
	icon,
	summary,
	action,
	defaultOpen = true,
	children,
}: {
	/** storage key suffix; must be stable per section */
	id: string;
	title: string;
	icon?: string;
	/** one line shown while folded, e.g. "12 target dipilih" */
	summary?: ReactNode;
	/** control that stays in the header, next to the toggle (e.g. "Pilih semua") */
	action?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);

	useEffect(() => {
		try {
			const v = localStorage.getItem(`lg.fold.${id}`);
			if (v !== null) setOpen(v === "1");
		} catch {
			// blocked storage: keep the default
		}
	}, [id]);

	const toggle = () =>
		setOpen((v) => {
			try {
				localStorage.setItem(`lg.fold.${id}`, v ? "0" : "1");
			} catch {
				// nothing to remember, the section still folds for this visit
			}
			return !v;
		});

	return (
		<div className={`cl-group${open ? "" : " folded"}`}>
			<div className="cl-head">
				<button className="foldtoggle" type="button" onClick={toggle} aria-expanded={open}>
					{icon && <Icon name={icon} />}
					<span>{title}</span>
					<Icon name={open ? "expand_less" : "expand_more"} />
				</button>
				{!open && summary !== undefined && <span className="foldsum">{summary}</span>}
				{open && action}
			</div>
			{open && children}
		</div>
	);
}
