"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, logout } from "@/lib/session";
import { startJob } from "@/lib/jobs";
import type { JobKind } from "@/lib/targets";

/*
 * Server Actions are public endpoints, so each one re-checks the session.
 * A logged-out caller must never be able to start a build by posting here.
 */
async function requireAdmin() {
	if (!(await currentUser())) redirect("/login");
}

export async function startJobAction(formData: FormData) {
	await requireAdmin();

	const kind = String(formData.get("kind") ?? "") as JobKind;
	try {
		await startJob({
			kind,
			variant: String(formData.get("variant") ?? "") || undefined,
			arch: String(formData.get("arch") ?? "") || undefined,
			sdk: String(formData.get("sdk") ?? "") || undefined,
		});
	} catch (e) {
		const reason = e instanceof Error ? e.message : "unknown error";
		redirect(`/?error=${encodeURIComponent(reason)}`);
	}

	revalidatePath("/");
	redirect("/");
}

export async function logoutAction() {
	await logout();
	redirect("/login");
}
