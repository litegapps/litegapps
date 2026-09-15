"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";
import { logoutAction } from "@/app/actions";

/*
 * Navigation drawer, modelled on unpackgames' NavDrawer: a menu button in the
 * top-right corner opens a panel that slides in from the right over a blurred
 * backdrop, with a profile header, large flat menu rows, and an expandable
 * section holding logout.
 */

const LINKS = [
	{ href: "/", icon: "build", label: "Build" },
	{ href: "/server", icon: "monitoring", label: "Server" },
];

export default function NavDrawer({ user }: { user: string }) {
	const [open, setOpen] = useState(false);
	const [moreOpen, setMoreOpen] = useState(false);
	const pathname = usePathname();

	// Lock page scroll behind the drawer, and let Escape close it.
	useEffect(() => {
		document.body.style.overflow = open ? "hidden" : "";
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => {
			document.body.style.overflow = "";
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const close = () => setOpen(false);
	const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

	return (
		<>
			<div className="nav-actions">
				<ThemeToggle />
				<button className="icon-btn" type="button" onClick={() => setOpen(true)} aria-label="Buka menu">
					<Icon name="menu" />
				</button>
			</div>

			<div className={`drawer-backdrop${open ? " open" : ""}`} onClick={close} aria-hidden="true" />

			<div
				className={`nav-drawer${open ? " open" : ""}`}
				role="dialog"
				aria-modal="true"
				aria-label="Menu navigasi"
				// Closed drawer stays in the DOM for the slide animation; keep it
				// out of the tab order and away from screen readers meanwhile.
				inert={!open}
			>
				<div className="drawer-profile">
					<div className="drawer-profile-top">
						<div className="drawer-profile-avatar">
							<Icon name="shield_person" />
						</div>
						<button className="icon-btn drawer-close-btn" type="button" onClick={close} aria-label="Tutup menu">
							<Icon name="close" />
						</button>
					</div>
					<p className="drawer-profile-name">{user}</p>
					<p className="drawer-profile-handle">Admin panel build LiteGapps</p>
				</div>

				<div className="nav-drawer-divider" />

				<nav className="drawer-x-nav">
					{LINKS.map((l) => (
						<Link
							key={l.href}
							href={l.href}
							className={`drawer-x-item${isActive(l.href) ? " active" : ""}`}
							aria-current={isActive(l.href) ? "page" : undefined}
							onClick={close}
						>
							<Icon name={l.icon} />
							<span>{l.label}</span>
						</Link>
					))}
				</nav>

				<div className="nav-drawer-divider" />

				<button
					type="button"
					className="drawer-x-expand"
					onClick={() => setMoreOpen((v) => !v)}
					aria-expanded={moreOpen}
				>
					<span>Pengaturan &amp; Akun</span>
					<Icon name="expand_more" className={`drawer-x-chevron${moreOpen ? " open" : ""}`} />
				</button>

				{moreOpen && (
					<div className="drawer-x-submenu">
						{/* A form POST, never a <Link>: Next prefetches links, which
						    would silently end the session. */}
						<form action={logoutAction}>
							<button type="submit" className="drawer-x-subitem">
								<Icon name="logout" />
								<span>Keluar</span>
							</button>
						</form>
					</div>
				)}
			</div>
		</>
	);
}
