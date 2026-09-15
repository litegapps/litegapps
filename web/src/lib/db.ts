import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

/*
 * MySQL pool + schema bootstrap.
 *
 * The panel keeps very little state: who may log in, live sessions, and the
 * history of build jobs. Everything about what exists on SourceForge is read
 * from status.json instead, so the database is never the source of truth for
 * release data.
 */

let pool: mysql.Pool | null = null;

export function db(): mysql.Pool {
	if (!pool) {
		pool = mysql.createPool({
			host: process.env.MYSQL_HOST ?? "mysql",
			port: Number(process.env.MYSQL_PORT ?? 3306),
			user: process.env.MYSQL_USER ?? "litegapps",
			password: process.env.MYSQL_PASSWORD ?? "",
			database: process.env.MYSQL_DATABASE ?? "litegapps",
			waitForConnections: true,
			connectionLimit: 5,
			charset: "utf8mb4_general_ci",
		});
	}
	return pool;
}

let ready: Promise<void> | null = null;

/** Create the tables on first use. Safe to call on every request. */
export function ensureSchema(): Promise<void> {
	if (!ready) {
		ready = (async () => {
			const c = db();
			await c.query(`
				CREATE TABLE IF NOT EXISTS users (
					id            INT AUTO_INCREMENT PRIMARY KEY,
					username      VARCHAR(64) NOT NULL UNIQUE,
					password_hash VARCHAR(255) NOT NULL,
					created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
			`);
			await c.query(`
				CREATE TABLE IF NOT EXISTS sessions (
					token      CHAR(64) PRIMARY KEY,
					user_id    INT NOT NULL,
					created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					expires_at DATETIME NOT NULL,
					INDEX (expires_at)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
			`);
			await c.query(`
				CREATE TABLE IF NOT EXISTS jobs (
					id          INT AUTO_INCREMENT PRIMARY KEY,
					kind        VARCHAR(32) NOT NULL,
					label       VARCHAR(255) NOT NULL,
					argv        TEXT NOT NULL,
					status      ENUM('running','done','failed','unknown') NOT NULL DEFAULT 'running',
					exit_code   INT NULL,
					pid         INT NULL,
					pid_start   BIGINT NULL,
					log_file    VARCHAR(255) NOT NULL,
					exit_file   VARCHAR(255) NOT NULL DEFAULT '',
					started_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					finished_at DATETIME NULL,
					INDEX (started_at)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
			`);
			// Tables created before pid_start existed.
			const [cols] = await c.query<RowDataPacket[]>(
				"SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'pid_start'",
			);
			if (cols.length === 0) {
				await c.query("ALTER TABLE jobs ADD COLUMN pid_start BIGINT NULL AFTER pid");
			}
		})().catch((e) => {
			// Let the next request retry instead of caching a failed bootstrap.
			ready = null;
			throw e;
		});
	}
	return ready;
}
