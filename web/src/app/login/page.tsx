import { redirect } from "next/navigation";
import Icon from "@/components/Icon";
import { currentUser } from "@/lib/session";
import { loginAction } from "./actions";

export const metadata = { title: "Masuk — LiteGapps" };

const MESSAGES: Record<string, string> = {
	invalid: "Nama pengguna atau kata sandi salah.",
	empty: "Isi nama pengguna dan kata sandi.",
};

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	if (await currentUser()) redirect("/");

	const { error } = await searchParams;
	const message = error ? (MESSAGES[error] ?? "Gagal masuk.") : null;

	return (
		<div className="login-wrap">
			<div className="login-card">
				<div className="logo">
					<Icon name="shield_person" />
				</div>
				<h1>LiteGapps</h1>
				<p>Panel build — khusus admin</p>

				{message && (
					<div className="err">
						<Icon name="error" />
						<span>{message}</span>
					</div>
				)}

				<form action={loginAction}>
					<div className="field">
						<label htmlFor="username">Nama pengguna</label>
						<input id="username" name="username" autoComplete="username" autoFocus required />
					</div>
					<div className="field">
						<label htmlFor="password">Kata sandi</label>
						<input
							id="password"
							name="password"
							type="password"
							autoComplete="current-password"
							required
						/>
					</div>
					<button className="btn" type="submit" style={{ width: "100%", marginTop: 6 }}>
						<Icon name="login" />
						Masuk
					</button>
				</form>
			</div>
		</div>
	);
}
