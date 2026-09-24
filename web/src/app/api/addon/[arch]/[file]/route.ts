import { addonApiFile, serveApiFile } from "@/lib/addonapi";

/*
 * Public addon index for the LiteGapps Controller app:
 * GET /api/addon/<arch>/<sdk>.json. Deliberately no login - the app fetches
 * it anonymously. It only serves what web/make-addon-api.sh wrote.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ arch: string; file: string }> }) {
	const { arch, file } = await params;
	return serveApiFile(addonApiFile(arch, file));
}
