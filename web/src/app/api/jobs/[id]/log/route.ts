import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { getJob, readJobLog } from "@/lib/jobs";

/*
 * Log tail for the panel's live view. Auth is re-checked here: an API route
 * is reachable directly, not only through the page that polls it.
 */
export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	if (!(await currentUser())) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const jobId = Number(id);
	if (!Number.isInteger(jobId) || jobId < 1) {
		return NextResponse.json({ error: "bad id" }, { status: 400 });
	}

	const job = await getJob(jobId);
	if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

	return NextResponse.json(
		{ status: job.status, exit_code: job.exit_code, log: await readJobLog(jobId) },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
