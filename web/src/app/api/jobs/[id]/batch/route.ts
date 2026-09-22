import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { getJob, readJobEvents } from "@/lib/jobs";
import { parseBatchLog } from "@/lib/batchlog";

/*
 * Progress table for one batch build. The log is parsed here, not in the
 * browser: the file grows to megabytes while the answer stays a few KB.
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
	if (job.kind !== "build-batch") {
		return NextResponse.json({ error: "not a batch build" }, { status: 400 });
	}

	return NextResponse.json(
		{
			id: job.id,
			status: job.status,
			started_at: job.started_at,
			finished_at: job.finished_at,
			progress: parseBatchLog(await readJobEvents(jobId)),
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}
