import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { getJob, readJobLog } from "@/lib/jobs";

/*
 * Log tail for the panel's live view. Auth is re-checked here: an API route
 * is reachable directly, not only through the page that polls it.
 */
export async function GET(
	req: Request,
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

	// ?meta=1 skips the log body: the terminal panel uses it to find out which
	// job this is (and whether it belongs on this page) without pulling a
	// multi-megabyte tail first.
	const meta = new URL(req.url).searchParams.get("meta") === "1";

	// The terminal dialog draws its header from this too, so the job's own
	// details travel with the log instead of needing a second request.
	return NextResponse.json(
		{
			id: job.id,
			kind: job.kind,
			label: job.label,
			status: job.status,
			exit_code: job.exit_code,
			started_at: job.started_at,
			finished_at: job.finished_at,
			log: meta ? "" : await readJobLog(jobId),
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}
