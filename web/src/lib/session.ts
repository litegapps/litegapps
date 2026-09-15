import { cookies } from "next/headers";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { RowDataPacket } from "mysql2";
import { db, ensureSchema } from "./db";

/*
 * Cookie session backed by MySQL.
 *
 * Passwords use scrypt from node:crypto rather than an external hashing
 * dependency: it is memory-hard, ships with node, and this panel has exactly
 * one account to protect.
 */

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, l: number) => Promise<Buffer>;

const COOKIE = "lg_session";
const DAYS = 7;

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scrypt(password, salt, 64);
	return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, saltHex, keyHex] = stored.split(":");
	if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
	const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
	const want = Buffer.from(keyHex, "hex");
	// Lengths must match before timingSafeEqual, which throws otherwise.
	return key.length === want.length && timingSafeEqual(key, want);
}

/*
 * Create the admin account from ADMIN_USER / ADMIN_PASSWORD on first run.
 * Keeping the credentials in the environment means no password hash ever
 * lands in a tracked file. Changing ADMIN_PASSWORD updates the stored hash.
 */
export async function ensureAdmin(): Promise<void> {
	const user = process.env.ADMIN_USER;
	const pass = process.env.ADMIN_PASSWORD;
	if (!user || !pass) return;

	await ensureSchema();
	const c = db();
	const [rows] = await c.query<RowDataPacket[]>(
		"SELECT id, password_hash FROM users WHERE username = ? LIMIT 1",
		[user],
	);

	if (rows.length === 0) {
		await c.query("INSERT INTO users (username, password_hash) VALUES (?, ?)", [
			user,
			await hashPassword(pass),
		]);
		return;
	}
	if (!(await verifyPassword(pass, rows[0].password_hash))) {
		await c.query("UPDATE users SET password_hash = ? WHERE id = ?", [
			await hashPassword(pass),
			rows[0].id,
		]);
	}
}

export async function login(username: string, password: string): Promise<boolean> {
	await ensureAdmin();
	const c = db();
	const [rows] = await c.query<RowDataPacket[]>(
		"SELECT id, password_hash FROM users WHERE username = ? LIMIT 1",
		[username],
	);
	if (rows.length === 0) return false;
	if (!(await verifyPassword(password, rows[0].password_hash))) return false;

	const token = randomBytes(32).toString("hex");
	await c.query(
		"INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))",
		[token, rows[0].id, DAYS],
	);

	const jar = await cookies();
	jar.set(COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		// Browsers refuse to store a Secure cookie sent over plain http, which
		// would make every login bounce straight back to the form. So the flag
		// follows the scheme the panel is actually served on.
		secure: (process.env.SITE_URL ?? "").startsWith("https://"),
		path: "/",
		maxAge: DAYS * 24 * 60 * 60,
	});
	return true;
}

export async function logout(): Promise<void> {
	const jar = await cookies();
	const token = jar.get(COOKIE)?.value;
	if (token) {
		await ensureSchema();
		await db().query("DELETE FROM sessions WHERE token = ?", [token]);
	}
	jar.delete(COOKIE);
}

/** Username of the signed-in admin, or null. */
export async function currentUser(): Promise<string | null> {
	const jar = await cookies();
	const token = jar.get(COOKIE)?.value;
	if (!token) return null;

	await ensureSchema();
	const [rows] = await db().query<RowDataPacket[]>(
		`SELECT u.username FROM sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.token = ? AND s.expires_at > NOW() LIMIT 1`,
		[token],
	);
	return rows.length ? (rows[0].username as string) : null;
}
