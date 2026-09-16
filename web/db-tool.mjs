/*
 * web/db-tool.mjs
 *
 * Database backup and restore for the panel, used by web/db-backup.sh and
 * web/db-restore.sh.
 *
 *   node web/db-tool.mjs dump <file>
 *   node web/db-tool.mjs load <file> [keep-job-id]
 *
 * Why a JSON dump instead of mysqldump: the image has no MySQL 8 client (the
 * Debian one is MariaDB and cannot speak caching_sha2_password), and the panel
 * only stores three small tables. Rows go back in through parameterised
 * inserts, so nothing is ever parsed back out of SQL text.
 *
 * The file is ALWAYS encrypted (AES-256-GCM, key DB_BACKUP_KEY). Backups are
 * uploaded to the SourceForge File Release System, which is world readable,
 * and this database holds the admin password hash - a plaintext dump there
 * would be a public credential leak. Without a key the tool refuses to run.
 *
 * Live sessions are deliberately not part of a backup: session.token is the
 * raw login cookie, so the safest place for it is nowhere but the VPS.
 * Everything else the panel keeps - the admin account, job history, its
 * settings and the per-target build config - travels with the backup.
 *
 * Copyright 2020 - 2025 The LiteGapps Project
 */

import { createRequire } from "node:module";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

// Tables worth keeping. `sessions` is omitted on purpose (see header).
const TABLES = ["users", "jobs", "settings", "build_targets", "package_lists", "build_config"];
const MAGIC = "LGDB1";

function die(msg) {
	console.error(`! ${msg}`);
	process.exit(1);
}

/* ── env ─────────────────────────────────────────────────────────────── */

function loadEnv() {
	// In the container these come from env_file; on the host read web/.env,
	// the same way make-status.sh does.
	const file = path.join(HERE, ".env");
	if (!existsSync(file)) return;
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
		if (!m) continue;
		if (process.env[m[1]] === undefined) {
			process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
		}
	}
}

function key() {
	const raw = (process.env.DB_BACKUP_KEY ?? "").trim();
	if (!raw) {
		die(
			"DB_BACKUP_KEY is not set in web/.env - refusing to write an unencrypted backup " +
				"(the SourceForge release area is public). Run bash web/start.sh to generate one.",
		);
	}
	if (!/^[0-9a-fA-F]{64}$/.test(raw)) die("DB_BACKUP_KEY must be 64 hex characters (32 bytes)");
	return Buffer.from(raw, "hex");
}

/** Short public identifier of a key, so a backup can say which key it needs. */
export function fingerprint(k) {
	return createHash("sha256").update(k).digest("hex").slice(0, 8);
}

/* ── mysql2, which lives outside the Next bundle ─────────────────────── */

function loadMysql() {
	const candidates = [
		"/app/tools/node_modules",
		path.join(HERE, "node_modules"),
		path.join(ROOT, "node_modules"),
	];
	for (const dir of candidates) {
		try {
			const require = createRequire(path.join(dir, "index.js"));
			return require("mysql2/promise");
		} catch {
			// try the next location
		}
	}
	die(`mysql2 not found (looked in: ${candidates.join(", ")})`);
}

async function connect(mysql) {
	return mysql.createConnection({
		host: process.env.MYSQL_HOST ?? "mysql",
		port: Number(process.env.MYSQL_PORT ?? 3306),
		user: process.env.MYSQL_USER ?? "litegapps",
		password: process.env.MYSQL_PASSWORD ?? "",
		database: process.env.MYSQL_DATABASE ?? "litegapps",
		charset: "utf8mb4_general_ci",
		dateStrings: true,
	});
}

/* ── file format ─────────────────────────────────────────────────────── */
/*
 * "LGDB1 <key fingerprint> <iv hex>\n" + AES-256-GCM(gzip(json)) + 16 byte tag
 *
 * The header is plaintext so a restore can say "this backup needs another
 * key" instead of failing with an authentication error.
 */

function seal(json, k) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", k, iv);
	const body = Buffer.concat([
		cipher.update(gzipSync(Buffer.from(JSON.stringify(json), "utf8"))),
		cipher.final(),
	]);
	const head = Buffer.from(`${MAGIC} ${fingerprint(k)} ${iv.toString("hex")}\n`, "utf8");
	return Buffer.concat([head, body, cipher.getAuthTag()]);
}

function unseal(buf, k) {
	const nl = buf.indexOf(0x0a);
	if (nl < 0) die("not a LiteGapps backup file");
	const [magic, fp, ivHex] = buf.subarray(0, nl).toString("utf8").split(" ");
	if (magic !== MAGIC) die(`unknown backup format <${magic}>`);
	if (fp !== fingerprint(k)) {
		die(`backup was made with another key (needs ${fp}, DB_BACKUP_KEY is ${fingerprint(k)})`);
	}
	const body = buf.subarray(nl + 1, buf.length - 16);
	const tag = buf.subarray(buf.length - 16);
	const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(ivHex, "hex"));
	decipher.setAuthTag(tag);
	let plain;
	try {
		plain = Buffer.concat([decipher.update(body), decipher.final()]);
	} catch {
		die("backup is corrupt or was tampered with (authentication failed)");
	}
	return JSON.parse(gunzipSync(plain).toString("utf8"));
}

/* ── commands ────────────────────────────────────────────────────────── */

async function dump(file) {
	const k = key();
	const mysql = loadMysql();
	const c = await connect(mysql);
	const data = { version: 1, created: new Date().toISOString(), tables: {} };
	try {
		for (const t of TABLES) {
			const [rows] = await c.query(`SELECT * FROM \`${t}\``);
			data.tables[t] = rows;
			console.log(`- ${t}: ${rows.length} row(s)`);
		}
	} finally {
		await c.end();
	}

	writeFileSync(file, seal(data, k));
	console.log(`- written : ${file}`);
	console.log(`- key     : ${fingerprint(k)}`);
}

async function load(file, keepJobId) {
	const k = key();
	const data = unseal(readFileSync(file), k);
	if (!data?.tables) die("backup has no tables");
	console.log(`- backup from ${data.created}`);

	const mysql = loadMysql();
	const c = await connect(mysql);
	try {
		await c.query("SET FOREIGN_KEY_CHECKS = 0");
		for (const t of TABLES) {
			const rows = data.tables[t];
			if (!Array.isArray(rows)) {
				console.log(`- ${t}: not in this backup, left as it is`);
				continue;
			}

			// The restore job's own row must survive, or the panel would come
			// back to a history that ends before the restore that produced it.
			if (t === "jobs" && keepJobId) {
				await c.query("DELETE FROM `jobs` WHERE id <> ?", [keepJobId]);
			} else {
				await c.query(`DELETE FROM \`${t}\``);
			}

			let n = 0;
			for (const row of rows) {
				const r = { ...row };
				// Jobs that were running when the backup was taken point at a
				// pid from a long dead container generation.
				if (t === "jobs" && r.status === "running") {
					r.status = "unknown";
					r.pid = null;
					r.pid_start = null;
				}
				if (t === "jobs" && keepJobId && Number(r.id) === Number(keepJobId)) continue;
				const cols = Object.keys(r);
				if (!cols.length) continue;
				await c.query(
					`INSERT INTO \`${t}\` (${cols.map((x) => `\`${x}\``).join(",")}) VALUES (${cols
						.map(() => "?")
						.join(",")})`,
					cols.map((x) => r[x]),
				);
				n++;
			}
			console.log(`- ${t}: ${n} row(s) restored`);
		}
		await c.query("SET FOREIGN_KEY_CHECKS = 1");
	} finally {
		await c.end();
	}
	console.log("- done");
}

/* ── main ────────────────────────────────────────────────────────────── */

loadEnv();
const [cmd, file, keepJobId] = process.argv.slice(2);
if (!cmd || !file) die("usage: node web/db-tool.mjs <dump|load> <file> [keep-job-id]");

if (cmd === "dump") await dump(file);
else if (cmd === "load") await load(file, keepJobId);
else if (cmd === "fingerprint") console.log(fingerprint(key()));
else die(`unknown command <${cmd}>`);
