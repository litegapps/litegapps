import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { writeBatchPrefs, writeSinglePrefs } from "@/lib/formstate";

/*
 * Remember what the build forms are set to, as soon as they are changed -
 * not only when a job is started. Switching to another menu and back has to
 * come back to the same selection, so every tick is stored.
 *
 * Values are validated in formstate before they are written; anything unknown
 * is dropped there rather than trusted from the browser.
 */
export async function POST(req: Request) {
	if (!(await currentUser())) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch {
		return NextResponse.json({ error: "bad body" }, { status: 400 });
	}

	try {
		if (body.form === "batch") {
			await writeBatchPrefs({
				archs: (body.archs as string[]) ?? [],
				sdks: (body.sdks as number[]) ?? [],
				auto: body.auto !== false,
				variants: (body.variants as string[]) ?? [],
				restoreMissing: body.restoreMissing !== false,
				cleanAfter: body.cleanAfter === true,
				buildAddon: body.buildAddon === true,
				upload: body.upload === true,
			});
		} else if (body.form === "single") {
			await writeSinglePrefs({
				kind: String(body.kind ?? ""),
				variant: String(body.variant ?? ""),
				arch: String(body.arch ?? ""),
				sdk: String(body.sdk ?? ""),
			});
		} else {
			return NextResponse.json({ error: "unknown form" }, { status: 400 });
		}
	} catch {
		return NextResponse.json({ error: "gagal menyimpan" }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
