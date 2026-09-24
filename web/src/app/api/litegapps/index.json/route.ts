import path from "node:path";
import { apiDir, serveApiFile } from "@/lib/addonapi";

/* Public list of every target that has a release index. No login, like the files it lists. */
export const dynamic = "force-dynamic";

export async function GET() {
	return serveApiFile(path.join(apiDir("litegapps"), "index.json"));
}
