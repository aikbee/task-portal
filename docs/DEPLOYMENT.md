# Deployment

Live at **https://task.system-portal.com** on a Hostinger VPS running CloudPanel.

Push to `main` → GitHub Actions lints and builds → if that passes it connects to the
VPS over SSH and runs `scripts/deploy.sh`, which pulls the exact commit that was
tested, installs, builds into a staging directory, applies database migrations, swaps
the build in, restarts pm2 and health-checks it. Any failure restores the previous
release and fails the job.

## How the server is arranged

CloudPanel owns nginx, MySQL and the TLS certificate, so the pipeline never touches
them. The app is a plain Node process behind CloudPanel's reverse proxy.

| Thing | Where |
| --- | --- |
| App + git checkout | `/home/system-portal-task/htdocs/task.system-portal.com` |
| Environment | `.env` in that directory, mode 600 |
| Attachments | `/home/system-portal-task/data/uploads` (outside the checkout) |
| Listens on | `127.0.0.1:3891`, proxied by CloudPanel's vhost |
| Process manager | pm2 as `system-portal-task`, unit `pm2-system-portal-task.service` |
| Node | v24 via that user's nvm, matching CI |
| Database | `task-portal`, created through CloudPanel |
| Logs | `pm2 logs task-portal`, nginx logs in `~/logs/nginx/` |

The app runs as the CloudPanel site user, which is also the account CI deploys with,
so no sudo is involved anywhere in the pipeline.

## Day to day

```bash
ssh system-portal-task@72.62.246.43
pm2 status
pm2 logs task-portal --lines 100
pm2 restart task-portal
curl -s localhost:3891/api/health
```

Deploy by hand, from the app directory:

```bash
bash scripts/deploy.sh origin/main
```

Roll back to any earlier commit the same way:

```bash
bash scripts/deploy.sh <previous-commit-sha>
```

## GitHub configuration

Repository secrets under Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `SSH_HOST` | `72.62.246.43` |
| `SSH_USER` | `system-portal-task` |
| `SSH_KEY` | private half of the CI keypair |
| `SSH_KNOWN_HOSTS` | `ssh-keyscan 72.62.246.43` output |

The server also holds a read-only **deploy key** so it can pull the private repo.

## Rebuilding the server from scratch

1. Create a CloudPanel **Node.js site** for the domain. It generates the vhost, the
   reverse proxy to a port, the site user and the TLS certificate.
2. As the site user: install Node with nvm and `npm install -g pm2`.
3. Create the database: `clpctl db:add --domainName=... --databaseName=task-portal
   --databaseUserName=task-portal --databaseUserPassword=...`. CloudPanel rejects
   underscores in these names.
4. Write `.env` in the app directory. Generate secrets with `openssl rand -hex 32`.
5. Add a deploy key on the server (`ssh-keygen -t ed25519 -f ~/.ssh/id_github`) and
   register the public half on the GitHub repo, read-only.
6. Populate the checkout in place, since the directory already holds `.env`:

   ```bash
   git init && git remote add origin git@github.com:aikbee/task-portal.git
   git fetch origin main && git checkout -f -b main origin/main
   ```

7. `npm ci --include=dev && npm run build`
8. Create the schema and the first admin:

   ```bash
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=a-long-password \
     node --env-file=.env scripts/setup-db.mjs --no-seed
   ```

9. Start it and make it survive reboots:

   ```bash
   pm2 start ./node_modules/next/dist/bin/next --name task-portal -- start -H 127.0.0.1 -p 3891
   pm2 save
   ```

   Then as root, once: `pm2 startup systemd -u system-portal-task --hp /home/system-portal-task`

## Never do these

- **Never change `DATA_KEY`** in `.env` once Info credentials exist. They are encrypted
  with it and become permanently unreadable. `SESSION_SECRET` only signs everyone out.
- **Never run `npm run db:reset`** on the server. It drops every table and deletes
  uploaded files. Deploys use `setup-db.mjs --no-seed`, which only adds what is missing.
- **Never point `UPLOAD_DIR` inside the checkout.** Releases would delete attachments.
- **Never edit the vhost by hand.** CloudPanel regenerates it. Use its vhost editor.

## Backups

The database, the uploads and `.env` must be backed up together. Without `DATA_KEY`
a database backup cannot decrypt its own stored credentials.

```bash
clpctl db:export --databaseName=task-portal --file=/home/system-portal-task/backups/db.sql.gz
tar czf ~/backups/uploads.tar.gz -C /home/system-portal-task/data uploads
cp ~/htdocs/task.system-portal.com/.env ~/backups/env.backup
```

## Notes and limits

- Building happens on the VPS. It has 8 GB of RAM and 2 cores, which is comfortable.
  During `npm ci` and `npm run build` the old release keeps serving; the new build is
  assembled in `.next.new` and swapped in, so the visible interruption is the restart.
- nginx caps uploads at 64 MB server-wide and Cloudflare's free plan at 100 MB, while
  the app allows 50 MB per attachment with several per request. A large multi-file
  upload can hit the nginx limit before the app sees it.
- The domain is proxied through Cloudflare. The origin has its own certificate, so
  Cloudflare SSL mode should be Full or Full (strict).
- Attachments live on this server's disk, so the app cannot scale to a second machine
  without shared storage.
