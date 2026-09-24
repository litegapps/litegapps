import path from "node:path";
import { addonApiDir, serveApiFile } from "@/lib/addonapi";

/* Public list of every target that has an addon index. No login, like the files it lists. */
export const dynamic = "force-dynamic";

export async function GET() {
	return serveApiFile(path.join(addonApiDir(), "index.json"));
}
