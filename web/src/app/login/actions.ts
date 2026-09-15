"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/session";

export async function loginAction(formData: FormData) {
	const username = String(formData.get("username") ?? "").trim();
	const password = String(formData.get("password") ?? "");

	if (!username || !password) redirect("/login?error=empty");
	if (!(await login(username, password))) redirect("/login?error=invalid");

	redirect("/");
}
