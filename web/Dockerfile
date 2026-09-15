# LiteGapps build panel (Next.js, standalone output).
#
# This image runs the web panel AND the builds it triggers, so it carries the
# same toolchain as the vps-build image: the panel shells out to build.sh,
# packages/make and web/make-status.sh rather than reimplementing them.
#
#   !!! KEEP THIS IMAGE PRIVATE — at runtime it holds your SourceForge ssh key.
#   !!! Never `docker push` it to a public registry.

# ── build stage ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json next.config.ts ./
COPY src ./src
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

# Toolchain for the shelled-out builds (mirrors the repo root Dockerfile).
RUN apt-get update && apt-get install -y --no-install-recommends \
		bash \
		curl \
		ca-certificates \
		zip \
		unzip \
		tar \
		xz-utils \
		brotli \
		rsync \
		openssh-client \
		default-jre-headless \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV REPO_ROOT=/litegapps

# Standalone output ships its own minimal node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Imports the SourceForge key from the read-only /ssh-host mount and drops
# to the host user (PUID/PGID) so builds do not leave root-owned files.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
