import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { readSysInfo } from "@/lib/sysinfo";

// Host details are for the admin only, same as everything else here.
export async function GET() {
	if (!(await currentUser())) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	return NextResponse.json(await readSysInfo(), {
		headers: { "Cache-Control": "no-store" },
	});
}
