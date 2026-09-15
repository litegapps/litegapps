import type { NextConfig } from "next";

// SITE_URL is the address the panel is opened at (e.g. http://<ip>:3020).
// Served directly with no reverse proxy, the browser's Origin and the Host
// header already agree, so this is only a fallback for the Server Actions
// origin check if a proxy is ever put in front.
const siteHost = (process.env.SITE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

const nextConfig: NextConfig = {
	// Standalone output so the container runs `node server.js` with no full
	// node_modules tree.
	output: "standalone",
	poweredByHeader: false,
	compress: true,
	experimental: {
		// Never reuse auth-dependent segments from the client router cache,
		// or a logged-out view can survive a login.
		staleTimes: { dynamic: 0 },
		serverActions: {
			allowedOrigins: ["localhost:3000", ...(siteHost ? [siteHost] : [])],
		},
	},
};

export default nextConfig;
