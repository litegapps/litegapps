import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { getJob, readJobLog } from "@/lib/jobs";
import { parseMirrorLog } from "@/lib/mirrorlog";

/* Per-file progress of a mirror job, parsed from its log server-side. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	if (!(await currentUser())) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	const jobId = Number((await params).id);
	if (!Number.isInteger(jobId) || jobId < 1) {
		return NextResponse.json({ error: "bad id" }, { status: 400 });
	}
	const job = await getJob(jobId);
	if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
	if (!job.kind.startsWith("mirror-")) {
		return NextResponse.json({ error: "not a mirror job" }, { status: 400 });
	}
	return NextResponse.json(
		{
			id: job.id,
			kind: job.kind,
			status: job.status,
			started_at: job.started_at,
			// The latest stats block and the recent "Copied" lines are always in
			// the tail; readJobLog keeps the last 200 KB.
			progress: parseMirrorLog(await readJobLog(jobId)),
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}
