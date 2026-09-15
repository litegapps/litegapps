"use client";

import { useEffect, useState } from "react";

const ORDER = ["auto", "dark", "light"] as const;
const ICON: Record<string, string> = {
	auto: "brightness_auto",
	dark: "dark_mode",
	light: "light_mode",
};

/*
 * The initial theme is applied by the boot script in layout.tsx so there is
 * no flash; this only reads it back and cycles it.
 */
export default function ThemeToggle() {
	const [theme, setTheme] = useState("auto");

	useEffect(() => {
		setTheme(document.documentElement.getAttribute("data-theme") ?? "auto");
	}, []);

	function cycle() {
		const next = ORDER[(ORDER.indexOf(theme as (typeof ORDER)[number]) + 1) % ORDER.length];
		document.documentElement.setAttribute("data-theme", next);
		try {
			localStorage.setItem("lg-theme", next);
		} catch {
			// Private mode or blocked storage: the choice just will not persist.
		}
		setTheme(next);
	}

	return (
		<button className="icon-btn" type="button" onClick={cycle} title="Ganti tema" aria-label="Ganti tema">
			<span className="msr" data-icon={ICON[theme] ?? ICON.auto} aria-hidden="true" />
		</button>
	);
}
