import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { runningJob } from "@/lib/jobs";

/*
 * Which job is running right now, if any. The terminal dialog watches this so
 * a process started from any page - or from another browser tab - pops its
 * own terminal here as well.
 */
export async function GET() {
	if (!(await currentUser())) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	const job = await runningJob();
	return NextResponse.json(
		{ id: job?.id ?? null, label: job?.label ?? null, kind: job?.kind ?? null },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
