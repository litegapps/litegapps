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
 * only stores a few small tables. Rows go back in through parameterised
 * inserts, so nothing is ever parsed back out of SQL text.
 *
 * The file is ALWAYS encrypted (AES-256-GCM, key DB_BACKUP_KEY). Backups are
 * uploaded to the SourceForge File Release System, which is world readable,
 * and this database holds the admin password hash - a plaintext dump there
 * would be a public credential leak. Without a key the tool refuses to run.
 *
 * A backup holds everything the panel keeps except credentials: every table
 * but `users` and `sessions`, plus the panel's own state files under web/
 * (job logs, the File API indexes, the Drive mirror state). Credentials stay
 * on the VPS: session.token is the raw login cookie, and the admin account is
 * created from ADMIN_USER / ADMIN_PASSWORD in .env by ensureAdmin(). .env,
 * the ssh key and the rclone token live outside these paths and are never
 * read. Backups made before files were added restore their tables only.
 *
 * Copyright 2020 - 2025 The LiteGapps Project
 */

import { createRequire } from "node:module";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

// Tables worth keeping. `users` and `sessions` are omitted on purpose (see
// header), so a restore never touches the login account or logs anyone out.
const TABLES = ["jobs", "settings", "build_targets", "package_lists", "build_config"];

// Panel state files, relative to web/. Only names matching `match` are read
// or written, so a backup can never reach .env, keys or anything outside.
const FILE_SETS = [
	{ dir: "job-logs", match: /^\d+\.(log|exit)$/, recursive: false },
	{ dir: "api", match: /^[\w.-]+\.(json|md)$/, recursive: true },
	{ dir: ".", match: /^(mirror-status\.json|mirror-files\.json|mirror-copied\.tsv)$/, recursive: false },
];

// The shell build configs the /config page edits (CONFIG_FILES in
// src/lib/config.ts), repo-relative. They are git-tracked files, so a backup
// keeps only their values: a restore rewrites the value of keys the file
// still has and leaves comments, order and keys added by later commits alone,
// exactly like the /config editor does.
const CONFIG_FILES = [
	"config",
	"packages/config",
	...["lite", "core", "go", "micro", "pixel", "nano", "basic", "user", "superlite"].map(
		(v) => `core/litegapps/${v}/config`,
	),
	"core/litegappsx/microg/config",
];
// The build identity lives in the build_config table and must never be
// written back into the repo `config` (see CLAUDE.md), so it is skipped there.
const IDENTITY_KEYS = new Set(["version", "version.code", "codename", "name.builder", "build.status"]);
const KEY_LINE = /^([A-Za-z0-9_.-]+)=(.*)$/;

function configKeySkipped(file, key) {
	return file === "config" && IDENTITY_KEYS.has(key);
}

function readConfigValues(file) {
	let raw;
	try {
		raw = readFileSync(path.join(ROOT, file), "utf8");
	} catch {
		return null;
	}
	const values = {};
	for (const line of raw.split("\n")) {
		const m = KEY_LINE.exec(line);
		if (m && !(m[1] in values) && !configKeySkipped(file, m[1])) values[m[1]] = m[2];
	}
	return values;
}

/** Returns the keys whose value changed. */
function writeConfigValues(file, values) {
	const full = path.join(ROOT, file);
	let raw;
	try {
		raw = readFileSync(full, "utf8");
	} catch {
		return null;
	}
	const done = new Set();
	const changed = [];
	const out = raw.split("\n").map((line) => {
		const m = KEY_LINE.exec(line);
		if (!m || done.has(m[1])) return line;
		const key = m[1];
		done.add(key);
		if (configKeySkipped(file, key) || !Object.hasOwn(values, key)) return line;
		const next = values[key];
		// Same rule as badValue(): one plain line a shell grep | cut can read.
		if (typeof next !== "string" || next.length > 500 || /[\p{Cc}]/u.test(next) || next !== next.trim()) {
			return line;
		}
		if (next === m[2]) return line;
		changed.push(key);
		return `${key}=${next}`;
	});
	if (changed.length) {
		const tmp = `${full}.restore-${process.pid}`;
		writeFileSync(tmp, out.join("\n"), "utf8");
		renameSync(tmp, full);
	}
	return changed;
}

function listFiles(set) {
	const out = [];
	const walk = (rel) => {
		let entries;
		try {
			entries = readdirSync(path.join(HERE, rel), { withFileTypes: true });
		} catch {
			return; // directory not there yet
		}
		for (const e of entries) {
			const p = rel === "." ? e.name : `${rel}/${e.name}`;
			if (e.isDirectory() && set.recursive && /^[\w.-]+$/.test(e.name)) walk(p);
			else if (e.isFile() && set.match.test(e.name)) out.push(p);
		}
	};
	walk(set.dir);
	return out;
}

/** A relative path a backup may write: inside one of FILE_SETS, no "..". */
function allowedFile(rel) {
	if (typeof rel !== "string" || rel.includes("..") || rel.startsWith("/")) return false;
	const parts = rel.split("/");
	const name = parts[parts.length - 1];
	return FILE_SETS.some((s) => {
		const top = s.dir === "." ? parts.length === 1 : parts[0] === s.dir && (s.recursive || parts.length === 2);
		return top && s.match.test(name);
	});
}

// Logs are text, but rclone and builds can print stray bytes; keep those
// byte-exact instead of letting utf8 replace them.
function encodeFile(buf) {
	const text = buf.toString("utf8");
	return Buffer.from(text, "utf8").equals(buf) ? { text } : { base64: buf.toString("base64") };
}

function decodeFile(f) {
	if (typeof f.text === "string") return Buffer.from(f.text, "utf8");
	if (typeof f.base64 === "string") return Buffer.from(f.base64, "base64");
	return null;
}

function jobIdOf(rel) {
	const m = /^job-logs\/(\d+)\./.exec(rel);
	return m ? Number(m[1]) : null;
}
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

/*
 * The backup key is derived from the SourceForge ssh key by default. That key
 * has to be on every machine that can reach the backups at all, so moving the
 * panel to a new VPS needs nothing beyond what it needs anyway: copy the ssh
 * key, deploy, restore. It also grants write access to the release area, so
 * whoever holds it gains nothing from reading a backup. DB_BACKUP_KEY in .env
 * (64 hex) is only a fallback: it opens backups made with it before the
 * derivation existed, and seals new ones only when there is no ssh key.
 */
function sshKeyFile() {
	return path.join(process.env.HOME ?? "", ".ssh", "id_rsa");
}

function derivedKey() {
	try {
		const ssh = readFileSync(sshKeyFile());
		return createHash("sha256").update("litegapps-db-backup\n").update(ssh).digest();
	} catch {
		return null;
	}
}

function envKey() {
	const raw = (process.env.DB_BACKUP_KEY ?? "").trim();
	if (!raw) return null;
	if (!/^[0-9a-fA-F]{64}$/.test(raw)) die("DB_BACKUP_KEY must be 64 hex characters (32 bytes)");
	return Buffer.from(raw, "hex");
}

/** The key new backups are sealed with. */
function key() {
	const k = derivedKey() ?? envKey();
	if (!k) {
		die(
			`no backup key: neither DB_BACKUP_KEY in web/.env nor the ssh key ${sshKeyFile()} - ` +
				"refusing to write an unencrypted backup (the SourceForge release area is public)",
		);
	}
	return k;
}

/** Every key a backup may have been sealed with, for a restore. */
function keys() {
	const all = [derivedKey(), envKey()].filter(Boolean);
	if (!all.length) die(`no backup key: set DB_BACKUP_KEY in web/.env or import the ssh key ${sshKeyFile()}`);
	return all;
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

function unseal(buf, candidates) {
	const nl = buf.indexOf(0x0a);
	if (nl < 0) die("not a LiteGapps backup file");
	const [magic, fp, ivHex] = buf.subarray(0, nl).toString("utf8").split(" ");
	if (magic !== MAGIC) die(`unknown backup format <${magic}>`);
	const k = candidates.find((c) => fingerprint(c) === fp);
	if (!k) {
		die(
			`backup was made with another key (needs ${fp}, this panel has ${candidates.map(fingerprint).join(", ")}) - ` +
				"import the ssh key it was made with, or put that key in DB_BACKUP_KEY",
		);
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
	const data = { version: 2, created: new Date().toISOString(), tables: {}, files: {}, configs: {} };
	try {
		for (const t of TABLES) {
			const [rows] = await c.query(`SELECT * FROM \`${t}\``);
			data.tables[t] = rows;
			console.log(`- ${t}: ${rows.length} row(s)`);
		}
	} finally {
		await c.end();
	}

	for (const set of FILE_SETS) {
		const files = listFiles(set);
		let bytes = 0;
		for (const rel of files) {
			const buf = readFileSync(path.join(HERE, rel));
			data.files[rel] = encodeFile(buf);
			bytes += buf.length;
		}
		console.log(`- web/${set.dir === "." ? "mirror-*" : set.dir}: ${files.length} file(s), ${bytes} bytes`);
	}

	let nkeys = 0;
	for (const file of CONFIG_FILES) {
		const values = readConfigValues(file);
		if (!values) continue;
		data.configs[file] = values;
		nkeys += Object.keys(values).length;
	}
	console.log(`- build configs: ${Object.keys(data.configs).length} file(s), ${nkeys} key(s)`);

	writeFileSync(file, seal(data, k));
	console.log(`- written : ${file}`);
	console.log(`- key     : ${fingerprint(k)}`);
}

async function load(file, keepJobId) {
	const data = unseal(readFileSync(file), keys());
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

	if (data.files && typeof data.files === "object") {
		let n = 0;
		let skipped = 0;
		for (const [rel, f] of Object.entries(data.files)) {
			const buf = f && typeof f === "object" ? decodeFile(f) : null;
			// The restore job's own log is being written right now.
			if (!buf || !allowedFile(rel) || (keepJobId && jobIdOf(rel) === Number(keepJobId))) {
				skipped++;
				continue;
			}
			const dest = path.join(HERE, rel);
			mkdirSync(path.dirname(dest), { recursive: true });
			const tmp = `${dest}.restore-${process.pid}`;
			writeFileSync(tmp, buf);
			renameSync(tmp, dest);
			n++;
		}
		console.log(`- files: ${n} restored${skipped ? `, ${skipped} skipped` : ""}`);
	} else {
		console.log("- files: not in this backup (made before files were included)");
	}

	if (data.configs && typeof data.configs === "object") {
		for (const [file, values] of Object.entries(data.configs)) {
			if (!CONFIG_FILES.includes(file) || !values || typeof values !== "object") continue;
			const changed = writeConfigValues(file, values);
			if (changed === null) console.log(`- ${file}: not in this checkout, skipped`);
			else if (changed.length) console.log(`- ${file}: ${changed.join(", ")}`);
		}
		console.log("- build configs: restored");
	} else {
		console.log("- build configs: not in this backup");
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
