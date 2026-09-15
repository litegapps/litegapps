import path from "node:path";

/*
 * Root of the LiteGapps checkout — the directory holding build.sh.
 * In the container it is a bind mount; in development it is the parent of
 * web/. Override with REPO_ROOT when neither applies.
 */
export function repoRoot(): string {
	return process.env.REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

export function jobLogDir(): string {
	return process.env.JOB_LOG_DIR ?? path.join(repoRoot(), "web", "job-logs");
}
