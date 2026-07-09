# Self-contained LiteGapps build image (survives SSH logout).
#
# SSH keys + .env are BAKED INTO the image so the container can scp to
# SourceForge with no runtime mounts.
#
#   !!! KEEP THIS IMAGE PRIVATE — it contains your SourceForge SSH key.
#   !!! Never `docker push` it to a public registry.
#
# Setup once:
#   cp ~/.ssh/id_rsa      docker/ssh/          # your SourceForge private key
#   cp ~/.ssh/id_rsa.pub  docker/ssh/          # (optional)
#   # optional: pin the host key so the first upload can't hang
#   ssh-keyscan web.sourceforge.net > docker/ssh/known_hosts
#   cp .env.example .env  && edit SF_USER
#
# Build & run detached:
#   docker compose up -d --build      # or: docker build -t litegapps-build .
#   docker compose logs -f            #     docker run -d --name litegapps-build litegapps-build
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        bash \
        curl \
        ca-certificates \
        zip \
        unzip \
        tar \
        xz-utils \
        brotli \
        openssh-client \
        default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /litegapps
COPY . /litegapps

# Bake in the SourceForge SSH credentials (from docker/ssh/, gitignored).
COPY docker/ssh/ /root/.ssh/
RUN chmod 700 /root/.ssh && find /root/.ssh -type f -exec chmod 600 {} \; ; true

RUN chmod +x vps-build.sh build.sh packages/make 2>/dev/null || true

ENTRYPOINT ["bash", "vps-build.sh"]
