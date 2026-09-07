# Deploying to a Hostinger VPS

Push to `main` → GitHub Actions lints and builds → if that passes it connects to the
VPS over SSH and runs `scripts/deploy.sh`, which pulls the exact commit, installs,
builds, migrates the database, restarts the service and health-checks it. A failure
at any step restores the previous release.

Files involved:

| File | Runs where | Purpose |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | GitHub | Lint + build gate, then the SSH deploy |
| `scripts/deploy.sh` | VPS | Pull, install, build, migrate, restart, health check, rollback |
| `deploy/task-portal.service` | VPS | systemd unit (`/etc/systemd/system/`) |
| `deploy/task-portal.env.example` | VPS | Template for `/etc/task-portal.env` |
| `deploy/nginx.conf` | VPS | Reverse proxy (`/etc/nginx/sites-available/`) |

---

## 1. Put the code on GitHub

The repository currently has one commit and no remote. From your machine:

```bash
cd /Users/ab/Project/task-portal
git add -A
git commit -m "Admin portal application"
gh repo create task-portal --private --source=. --remote=origin --push
```

No `gh`? Create an empty private repo on github.com, then:

```bash
git remote add origin git@github.com:OWNER/task-portal.git && git push -u origin main
```

`.env*` and `uploads/*` are ignored, so no secrets or attachments are pushed.

---

## 2. Prepare the VPS

SSH in as root. Ubuntu 22.04 or 24.04 assumed.

**Packages and Node**

```bash
apt-get update && apt-get install -y curl git nginx mysql-server ufw
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
node -v
```

**Firewall**

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

**Deploy user and directories**

```bash
adduser --system --group --shell /bin/bash --home /home/deploy deploy
mkdir -p /srv/task-portal /var/lib/task-portal/uploads /home/deploy/.ssh
chown -R deploy:deploy /srv/task-portal /var/lib/task-portal /home/deploy
chmod 700 /home/deploy/.ssh
```

`/var/lib/task-portal/uploads` holds every attachment and is deliberately outside
the deploy directory, so a release can never delete it.

**Database**

```bash
mysql_secure_installation
mysql -e "CREATE DATABASE task_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'task_portal'@'localhost' IDENTIFIED BY 'PICK_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON task_portal.* TO 'task_portal'@'localhost';
FLUSH PRIVILEGES;"
```

**Environment file**

```bash
cp /dev/null /etc/task-portal.env    # then paste the template below
openssl rand -hex 32                  # SESSION_SECRET
openssl rand -hex 32                  # DATA_KEY
```

Fill `/etc/task-portal.env` from `deploy/task-portal.env.example`, then lock it down:

```bash
chown root:deploy /etc/task-portal.env && chmod 640 /etc/task-portal.env
```

> **`DATA_KEY` is permanent.** Every Info credential is encrypted with it. Replace it
> and those secrets can never be read again. Changing `SESSION_SECRET` only signs
> everyone out. Back both up somewhere outside the server.

**Give the server read access to the repository**

```bash
sudo -u deploy ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/id_github
cat /home/deploy/.ssh/id_github.pub
```

Add that public key to the repo under Settings → Deploy keys (read-only). Then:

```bash
sudo -u deploy bash -c 'cat >> ~/.ssh/config <<CFG
Host github.com
  IdentityFile ~/.ssh/id_github
  StrictHostKeyChecking accept-new
CFG'
sudo -u deploy git clone git@github.com:OWNER/task-portal.git /srv/task-portal
```

**First build and the first admin account**

```bash
cd /srv/task-portal
sudo -u deploy npm ci --include=dev
sudo -u deploy npm run build
sudo -u deploy env ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="a-long-password" ADMIN_NAME="Your Name" \
  node --env-file=/etc/task-portal.env scripts/setup-db.mjs --no-seed
```

`--no-seed` applies the schema and migrations only. It never creates the
`admin@example.com / admin123` demo logins or the sample projects, and the admin
above is the only account that exists. Deployments run the same command without
the `ADMIN_*` variables.

**Service**

```bash
cp /srv/task-portal/deploy/task-portal.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now task-portal
systemctl status task-portal --no-pager
curl -s localhost:3000/api/health
```

**Let the deploy user restart it**

```bash
cat > /etc/sudoers.d/task-portal <<'SUDO'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart task-portal, /usr/bin/systemctl status task-portal
SUDO
chmod 440 /etc/sudoers.d/task-portal && visudo -c
```

**Reverse proxy and TLS**

```bash
cp /srv/task-portal/deploy/nginx.conf /etc/nginx/sites-available/task-portal
sed -i 's/portal.example.com/YOUR.DOMAIN/' /etc/nginx/sites-available/task-portal
ln -sf /etc/nginx/sites-available/task-portal /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d YOUR.DOMAIN
```

Confirm `COOKIE_SECURE=1` in the env file once HTTPS works, then
`systemctl restart task-portal`.

---

## 3. Give GitHub access to the VPS

Generate a key **on your machine** for CI (separate from your own login key):

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/task_portal_deploy -N ""
ssh-copy-id -i ~/.ssh/task_portal_deploy.pub deploy@YOUR.VPS.IP
ssh-keyscan -H YOUR.VPS.IP            # copy the output
cat ~/.ssh/task_portal_deploy        # copy the private key
```

In the repo under Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `SSH_HOST` | VPS IP or hostname |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | contents of `~/.ssh/task_portal_deploy` (the private key) |
| `SSH_KNOWN_HOSTS` | the `ssh-keyscan` output |
| `SSH_PORT` | only if SSH is not on 22 |

Optional repository *variable* `APP_DIR` if the app is not at `/srv/task-portal`.

The workflow's deploy job uses the `production` environment, so you can add
required reviewers there if you want deploys to be approved manually.

---

## 4. Deploy

Push to `main`, or run the workflow manually from the Actions tab. Watch the job
output: it ends with the health response from the server.

To deploy by hand from the VPS:

```bash
sudo -u deploy APP_DIR=/srv/task-portal bash /srv/task-portal/scripts/deploy.sh origin/main
```

---

## Day to day

```bash
journalctl -u task-portal -f            # live logs
systemctl restart task-portal           # restart
curl -s localhost:3000/api/health        # health
```

**Rollback.** A failed deploy rolls back on its own. To go back after a successful
but bad deploy, deploy the previous commit:

```bash
sudo -u deploy bash /srv/task-portal/scripts/deploy.sh <previous-commit-sha>
```

**Backups.** Two things matter and they must be taken together:

```bash
mysqldump --single-transaction task_portal | gzip > /backup/db-$(date +%F).sql.gz
tar czf /backup/uploads-$(date +%F).tar.gz -C /var/lib/task-portal uploads
```

Keep a copy of `/etc/task-portal.env` too. Without `DATA_KEY` a database backup
cannot decrypt its own stored credentials.

## Never do these

- **Never change `DATA_KEY`** on a database that already has Info credentials.
- **Never run `npm run db:reset`** on the server. It drops every table and deletes
  uploaded files. Deploys use `setup-db.mjs --no-seed`, which only adds what is missing.
- **Never point `UPLOAD_DIR` inside `/srv/task-portal`.** Releases would delete attachments.
- **Never commit `.env.local`** or the production env file.

## Notes and limits

- Building happens on the VPS. During `npm ci` and `npm run build` the old release is
  still serving, but a request that needs a file being replaced can error for a few
  seconds. The new build is assembled in `.next.new` and swapped in, so the visible
  interruption is normally just the restart.
- A Next build wants roughly 1–2 GB of free memory. If the plan is smaller, add swap
  or switch to building in CI and shipping the artifact.
- Attachments are stored on this server's disk, so the app cannot be scaled to a
  second machine without shared storage.
