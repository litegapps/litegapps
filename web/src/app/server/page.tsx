import { redirect } from "next/navigation";
import AppBar from "@/components/AppBar";
import ServerStats from "@/components/ServerStats";
import { currentUser } from "@/lib/session";
import { readSysInfo } from "@/lib/sysinfo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Server — LiteGapps" };

export default async function ServerPage() {
	const user = await currentUser();
	if (!user) redirect("/login");
	const info = await readSysInfo();

	return (
		<>
			<AppBar user={user} />
			<div className="wrap">
				<div className="hero" style={{ paddingBlock: "28px 8px" }}>
					<h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
						Statistik Server
					</h1>
					<p style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
						Kondisi VPS tempat build dijalankan.
					</p>
				</div>
				<ServerStats initial={info} />
			</div>
		</>
	);
}
