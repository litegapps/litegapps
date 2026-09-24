import { apiFile, serveApiFile } from "@/lib/addonapi";

/*
 * Public release index: GET /api/litegapps/<arch>/<sdk>.json, the newest
 * release of every variant with link, md5 and upload time. Deliberately no
 * login. It only serves what web/make-release-api.sh wrote.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ arch: string; file: string }> }) {
	const { arch, file } = await params;
	return serveApiFile(apiFile("litegapps", arch, file));
}
