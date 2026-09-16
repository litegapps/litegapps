import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { detail, preview, FileError } from "@/lib/files";

/*
 * Details for one entry, plus a text preview when the file looks like text.
 * Used by the file manager's detail dialog, which would otherwise need a full
 * page render per row.
 */
export async function GET(req: Request) {
	if (!(await currentUser())) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const rel = url.searchParams.get("path") ?? "";
	try {
		const d = await detail(rel);
		const text = d.dir ? null : await preview(rel).catch(() => null);
		return NextResponse.json({ detail: d, preview: text });
	} catch (e) {
		const msg = e instanceof FileError ? e.message : "tidak bisa dibaca";
		return NextResponse.json({ error: msg }, { status: e instanceof FileError ? 400 : 404 });
	}
}
