"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Icon from "./Icon";
import Terminal from "./Terminal";

/*
 * The terminal panel under the form on each page that starts jobs.
 *
 * It shows the job named in ?job=<id> (where every form redirects after
 * starting one, and where the job history links), otherwise whatever is
 * running right now. `kinds` keeps each panel to its own work: a batch build
 * belongs under the checklist, not under the single-command form, so a panel
 * that does not own the job points at the page that does instead of
 * duplicating its log.
 */

/** Where each job kind's terminal lives. */
const HOME: Record<string, { href: string; label: string }> = {
	"build-batch": { href: "/", label: "Multi" },
	make: { href: "/?tab=single", label: "Single" },
	packages: { href: "/?tab=single", label: "Single" },
	clean: { href: "/?tab=single", label: "Single" },
	restore: { href: "/?tab=single", label: "Single" },
	"restore-bin": { href: "/restore", label: "Restore" },
	"restore-package": { href: "/restore", label: "Restore" },
	"restore-gapps": { href: "/restore", label: "Restore" },
	"clean-sources": { href: "/restore", label: "Restore" },
	"db-backup": { href: "/backup", label: "Backup DB" },
	"db-restore": { href: "/backup", label: "Backup DB" },
	"db-list": { href: "/backup", label: "Backup DB" },
	status: { href: "/info", label: "Info" },
	"mirror-check": { href: "/mirror", label: "Mirror source" },
	"mirror-sync": { href: "/mirror", label: "Mirror source" },
	"mirror-file": { href: "/mirror", label: "Mirror source" },
	"clear-output": { href: "/", label: "Multi" },
};

type Meta = { id: number; kind: string; label: string } | null;

export default function JobTerminal({ kinds }: { kinds: readonly string[] }) {
	const params = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const asked = Number(params.get("job"));
	const [running, setRunning] = useState<{ id: number; kind: string; label: string } | null>(null);
	const [askedMeta, setAskedMeta] = useState<Meta>(null);
	const [closed, setClosed] = useState<number | null>(null);
	const box = useRef<HTMLDivElement>(null);

	// What is running, so a job started in another tab still reports here.
	useEffect(() => {
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;
		async function tick() {
			try {
				const r = await fetch("/api/jobs/running", { cache: "no-store" });
				if (r.ok && alive) {
					const d: { id: number | null; kind: string | null; label: string | null } =
						await r.json();
					setRunning(d.id ? { id: d.id, kind: d.kind ?? "", label: d.label ?? "" } : null);
				}
			} catch {
				// keep the last state
			}
			if (alive) timer = setTimeout(tick, 3000);
		}
		tick();
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, []);

	// A job asked for by id may be finished already, so its kind is looked up
	// separately - meta only, no log.
	useEffect(() => {
		if (!Number.isInteger(asked) || asked < 1) {
			setAskedMeta(null);
			return;
		}
		let alive = true;
		fetch(`/api/jobs/${asked}/log?meta=1`, { cache: "no-store" })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => alive && setAskedMeta(d ? { id: d.id, kind: d.kind, label: d.label } : null))
			.catch(() => alive && setAskedMeta(null));
		return () => {
			alive = false;
		};
	}, [asked]);

	const candidate: Meta = askedMeta ?? running;
	const mine = candidate && kinds.includes(candidate.kind) && candidate.id !== closed;
	const elsewhere = candidate && !kinds.includes(candidate.kind) ? candidate : null;

	useEffect(() => {
		if (mine && asked) box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}, [mine, asked]);

	return (
		<div ref={box}>
			{mine && candidate ? (
				<Terminal
					jobId={candidate.id}
					onClose={() => {
						setClosed(candidate.id);
						if (asked) {
							const next = new URLSearchParams(params.toString());
							next.delete("job");
							router.replace(next.size ? `${pathname}?${next}` : pathname);
						}
						router.refresh();
					}}
				/>
			) : (
				<section className="card term-idle">
					<Icon name="terminal" />
					{elsewhere ? (
						<span>
							<b>{elsewhere.label}</b> sedang berjalan di menu lain — lihat lognya di{" "}
							<Link href={HOME[elsewhere.kind]?.href ?? "/"}>
								{HOME[elsewhere.kind]?.label ?? "menu asalnya"}
							</Link>
							.
						</span>
					) : (
						<span>
							Belum ada proses di sini. Log muncul begitu perintah di halaman ini dijalankan.
						</span>
					)}
				</section>
			)}
		</div>
	);
}
