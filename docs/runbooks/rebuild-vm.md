# Rebuild the VM from zero

## When to use

The Oracle VM is lost, corrupted, or you're standing up a replacement.
Target: serving health checks within 30 minutes.

## Steps

Follow `deploy/README.md` "First-time VM setup" top to bottom — it is the
source of truth for commands; this runbook is the order to run them in and
what "done" looks like at each stage.

1. **OS + Node** — set the clock to UTC, install Node 22 (NodeSource, arm64).
2. **Service user + directories** — create `karaoq`, `/opt/karaoq/releases`,
   `/etc/karaoq`, `/var/log/karaoq`.
3. **Env files** — `/etc/karaoq/env` (app secrets) and
   `/etc/karaoq/cron-secret` (0600, root-only). Pull current values from
   GitHub Secrets / Vercel per `docs/runbooks/rotate-secrets.md` — this is a
   restore of existing secrets, not new ones, unless you're rotating at the
   same time.
4. **systemd service** — copy `deploy/karaoq.service`, enable it. It will
   fail to start until step 6 puts a release in place; that's expected.
5. **`karaoq-activate`** — install to `/usr/local/sbin`, add the sudoers
   entry for the deploy user.
6. **First deploy** — run the "Deploy to VM" workflow (`target: production`
   or `staging`) against this host once `VM_HOST`/`VM_USER`/`VM_SSH_KEY`/
   `VM_KNOWN_HOSTS` GitHub secrets point at it. This creates the first
   release and starts the service.
7. **cloudflared** — install, `tunnel login`, create or reuse the `karaoq`
   tunnel, copy `deploy/cloudflared.yml` with the tunnel ID filled in,
   install as a service. Skip the DNS-cutover parts of `deploy/README.md`
   unless this VM is replacing the one currently live.
8. **Staging** (if this VM serves both) — "Staging" section of
   `deploy/README.md`.
9. **Backups** — `deploy/README.md` "Backups"; then prove restore works with
   `docs/runbooks/restore-database.md` before trusting this VM with real data.
10. **Monitoring** — `docs/runbooks/monitoring.md` (in-VM health check timer
    + external uptime monitor).
11. **Crontab** — only at DNS cutover, not before (`deploy/README.md` "DNS
    cutover" step 2).

## Verify

```
systemctl status karaoq cloudflared karaoq-error-spike.timer karaoq-backup.timer
curl http://127.0.0.1:3000/api/health
journalctl -u karaoq -n 50
```

All services active; health returns `{"ok":true}`.

## Rollback

Nothing to roll back — this is a from-scratch build. If a step fails, fix it
and re-run; `karaoq-activate` and the systemd units are idempotent to re-copy.
