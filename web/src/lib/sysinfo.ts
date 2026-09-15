import os from "node:os";
import { readFile, statfs } from "node:fs/promises";
import { repoRoot } from "./paths";

/*
 * Host statistics for the server page.
 *
 * Inside the container, /proc (load, memory, cpu counters, uptime) and the
 * kernel version already describe the host, because no cgroup limits are set.
 * Two things do NOT: /etc/hostname and /etc/os-release belong to the image.
 * docker-compose mounts the host's copies read-only under /host, and those
 * are preferred when present.
 */

export type SysInfo = {
	host: { hostname: string; os: string; kernel: string; arch: string; uptime: number };
	cpu: { model: string; cores: number; usage: number; load: [number, number, number] };
	memory: { total: number; used: number; available: number };
	swap: { total: number; used: number };
	disk: { path: string; total: number; used: number; free: number } | null;
	panel: { node: string; uptime: number };
	sampled_at: string;
};

async function readText(file: string): Promise<string | null> {
	try {
		return await readFile(/*turbopackIgnore: true*/ file, "utf8");
	} catch {
		return null;
	}
}

async function hostname(): Promise<string> {
	return ((await readText("/host/hostname")) ?? os.hostname()).trim();
}

async function osName(): Promise<string> {
	const text = (await readText("/host/os-release")) ?? (await readText("/etc/os-release")) ?? "";
	const m = text.match(/^PRETTY_NAME="?([^"\n]*)"?/m);
	return m ? m[1] : `${os.type()} ${os.release()}`;
}

/* Aggregate "cpu" line of /proc/stat: [busy, total] jiffies. */
async function cpuTimes(): Promise<[number, number] | null> {
	const text = await readText("/proc/stat");
	const line = text?.split("\n").find((l) => l.startsWith("cpu "));
	if (!line) return null;
	const v = line.trim().split(/\s+/).slice(1).map(Number);
	// user nice system idle iowait irq softirq steal
	const idle = (v[3] ?? 0) + (v[4] ?? 0);
	const total = v.slice(0, 8).reduce((a, b) => a + b, 0);
	return [total - idle, total];
}

/* CPU usage needs two samples; a single /proc/stat read is only a counter. */
async function cpuUsage(): Promise<number> {
	const a = await cpuTimes();
	await new Promise((r) => setTimeout(r, 300));
	const b = await cpuTimes();
	if (!a || !b || b[1] === a[1]) return 0;
	return Math.max(0, Math.min(100, ((b[0] - a[0]) / (b[1] - a[1])) * 100));
}

async function memInfo() {
	const text = (await readText("/proc/meminfo")) ?? "";
	const kb = (key: string) => {
		const m = text.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
		return m ? Number(m[1]) * 1024 : 0;
	};
	const total = kb("MemTotal") || os.totalmem();
	// MemAvailable, not MemFree: page cache is reclaimable and counting it as
	// "used" makes a healthy box look full.
	const available = kb("MemAvailable") || os.freemem();
	return {
		memory: { total, used: total - available, available },
		swap: { total: kb("SwapTotal"), used: kb("SwapTotal") - kb("SwapFree") },
	};
}

/* Filesystem holding the checkout — the one builds actually fill up. */
async function diskInfo(): Promise<SysInfo["disk"]> {
	const path = repoRoot();
	try {
		const s = await statfs(/*turbopackIgnore: true*/ path);
		const total = s.blocks * s.bsize;
		const free = s.bavail * s.bsize;
		return { path, total, free, used: total - s.bfree * s.bsize };
	} catch {
		return null;
	}
}

export async function readSysInfo(): Promise<SysInfo> {
	const [name, osPretty, usage, mem, disk] = await Promise.all([
		hostname(),
		osName(),
		cpuUsage(),
		memInfo(),
		diskInfo(),
	]);
	const cpus = os.cpus();
	const load = os.loadavg();

	return {
		host: {
			hostname: name,
			os: osPretty,
			kernel: os.release(),
			arch: os.arch(),
			uptime: os.uptime(),
		},
		cpu: {
			model: (cpus[0]?.model ?? "unknown").replace(/\s+/g, " ").trim(),
			cores: cpus.length,
			usage,
			load: [load[0], load[1], load[2]],
		},
		memory: mem.memory,
		swap: mem.swap,
		disk,
		panel: { node: process.version, uptime: process.uptime() },
		sampled_at: new Date().toISOString(),
	};
}
