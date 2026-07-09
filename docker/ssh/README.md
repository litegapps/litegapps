# docker/ssh — SourceForge SSH credentials (baked into the Docker image)

Place the SSH key that is already authorized on your SourceForge account here,
so the build container can `scp` uploads without any runtime mounts.

```bash
cp ~/.ssh/id_rsa      docker/ssh/           # your SourceForge private key
cp ~/.ssh/id_rsa.pub  docker/ssh/           # optional
# optional but recommended: pin the host key so the first upload can't hang
ssh-keyscan web.sourceforge.net > docker/ssh/known_hosts
```

Then build: `docker compose up -d --build`.

**Security**
- The real keys are gitignored (only this README is committed).
- The keys get copied into the image at `/root/.ssh`, so **keep the built image
  private** — never `docker push` it to a public registry.
