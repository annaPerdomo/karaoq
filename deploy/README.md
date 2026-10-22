# Deploying KaraoQ to the VM

Oracle Cloud Always Free ARM VM (Ubuntu, arm64), running the Next.js
standalone build under systemd, reached from the internet only through a
Cloudflare Tunnel (`cloudflared`). The VM is never directly exposed — the
Next server binds `127.0.0.1` only (see `karaoq.service`'s
`HOSTNAME=127.0.0.1`), and `lib/platform.ts`'s `clientIp()` trusts
`cf-connecting-ip` unconditionally when not on Vercel. That's only safe
because the only path in is through `cloudflared`; it does not also check the
request actually came from Cloudflare's network.

## First-time VM setup

```
# UTC system clock — cron below is written in UTC, not local time
sudo timedatectl set-timezone Etc/UTC

# Node 22 LTS (NodeSource, arm64)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Service user and directories. /opt/karaoq and releases/ stay root-owned;
# karaoq-activate (run via sudo) is what writes there.
sudo useradd --system --home /opt/karaoq --shell /usr/sbin/nologin karaoq
sudo mkdir -p /opt/karaoq/releases /etc/karaoq /var/log/karaoq
sudo chown -R karaoq:karaoq /var/log/karaoq

# Env file read by the service — see "Environment" below
sudo $EDITOR /etc/karaoq/env
sudo chmod 600 /etc/karaoq/env

# Cron secret, kept out of /etc/karaoq/env: deploy/crontab reads it with a
# plain `cat`, not EnvironmentFile-style shell parsing.
sudo $EDITOR /etc/karaoq/cron-secret   # one line, the CRON_SECRET value
sudo chown root:root /etc/karaoq/cron-secret
sudo chmod 600 /etc/karaoq/cron-secret

# systemd service
sudo cp deploy/karaoq.service /etc/systemd/system/karaoq.service
sudo systemctl daemon-reload
sudo systemctl enable karaoq

# karaoq-activate: what the deploy workflow runs over SSH as root
sudo cp deploy/activate.sh /usr/local/sbin/karaoq-activate
sudo chown root:root /usr/local/sbin/karaoq-activate
sudo chmod 700 /usr/local/sbin/karaoq-activate
echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/karaoq-activate *' | sudo tee /etc/sudoers.d/karaoq-activate
sudo chmod 440 /etc/sudoers.d/karaoq-activate
# ^ replace "deploy" with the VM_USER the deploy workflow SSHes in as

# cloudflared
sudo apt-get install -y cloudflared
cloudflared tunnel login
cloudflared tunnel create karaoq
sudo mkdir -p /etc/cloudflared
sudo cp <credentials file from the create step> /etc/cloudflared/
sudo cp deploy/cloudflared.yml /etc/cloudflared/config.yml   # fill in <TUNNEL_ID>
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Don't install `deploy/crontab` yet — see "DNS cutover" below. Until then,
`vercel.json`'s crons keep running the corpus jobs against Vercel.

## Environment (`/etc/karaoq/env`)

Every var the app code reads from `process.env`, grepped across `lib/`,
`pages/` and `components/`:

| Var | Required | Notes |
|---|---|---|
| `KARAOQ_ENV` | yes | set to `production`; see note below |
| `MONGODB_URI` | yes | |
| `MONGODB_DB` | yes | |
| `CRON_SECRET` | yes | also goes in `/etc/karaoq/cron-secret`, not here |
| `YOUTUBE_API_KEY` | yes | corpus harvest/search |
| `ANALYTICS_SECRET` | yes, for admin | without it `/admin`'s API routes refuse every request |
| `NTFY_TOPIC` | no | push alerts; skipped if unset |
| `KARAOKE_CHANNELS` | no | comma-separated channel ids/handles, extends the built-in list |
| `KARAOKE_PLAYLISTS` | no | comma-separated playlist ids |
| `YOUTUBE_DAY_CALLS` | no | overrides the daily quota ceiling |
| `SUGGESTION_RESOLVE_PER_DAY` | no | cron search budget override |
| `SUGGESTION_CHANNEL_PAGES` | no | cron harvest page budget override |
| `SUGGESTION_CHANNEL_PAGES_PER_CHANNEL` | no | |
| `SUGGESTION_LIVE_ROOM_WINDOW_MS` | no | |
| `SUGGESTION_PROPOSAL_SCAN` | no | |
| `SUGGESTION_CLAIM_SCAN` | no | |
| `SWEEP_PER_RUN` | no | |

```
KARAOQ_ENV=production
MONGODB_URI=...
MONGODB_DB=...
YOUTUBE_API_KEY=...
ANALYTICS_SECRET=...
```

Do **not** set `VERCEL` here. `lib/platform.ts` branches on
`process.env.VERCEL` to pick Vercel's geo/IP headers over Cloudflare's; a
`VERCEL` var on the VM would make it read the wrong headers and silently drop
geo/IP data. `KARAOQ_ENV=production` is what `isProductionDeploy()` checks
instead of Vercel's `VERCEL_ENV`.

Atlas's Network Access list must allow the VM's egress IP (add it as an
allowed IP, same as any other Atlas client). This repo's GitHub Actions build
also reads Mongo at build time for static props — if that's currently
allowed via a broad range such as `0.0.0.0/0`, the VM doesn't change that;
narrow it if you'd rather allowlist CI by its runner IPs instead.

## Deploy

Pushed by `.github/workflows/deploy-vm.yml` (`workflow_dispatch`), which
tests, builds the standalone bundle, ships it to the VM, and runs:

```
sudo /usr/local/sbin/karaoq-activate <release-tarball> <git-sha>
```

`karaoq-activate` extracts the release to a timestamped directory under
`/opt/karaoq/releases/`, atomically re-points `/opt/karaoq/current`, restarts
the service, and polls both `/` and `/api/geo` on `127.0.0.1:3000` for up to
30s. If that doesn't come up healthy, it re-points back to the previous
release, restarts, and exits 1 — so the workflow fails loudly instead of
leaving the VM on a broken build. It keeps the newest 5 releases, never
deleting the one it just activated or the one it was on before.

## Roll back by hand

```
ls -1 /opt/karaoq/releases          # <timestamp>-<sha>, sorts newest-last
sudo ln -sfn /opt/karaoq/releases/<older-release> /opt/karaoq/current.tmp
sudo mv -T /opt/karaoq/current.tmp /opt/karaoq/current
sudo systemctl restart karaoq
```

## Logs

```
journalctl -u karaoq -f        # app
journalctl -u cloudflared -f   # tunnel
tail -f /var/log/karaoq/cron.log
```

## DNS cutover

Until cutover, Cloudflare's DNS for `karaoq.live`/`www` points at Vercel
(DNS-only, not proxied) and Vercel keeps serving production. To cut over to
the VM:

1. Confirm the VM is healthy: `curl https://next.karaoq.live/api/geo` (the
   tunnel's third ingress hostname, usable for a side-by-side check before
   touching the live records).
2. Install the corpus cron now, not before: `sudo cp deploy/crontab
   /etc/cron.d/karaoq`. Remove the `crons` array from `vercel.json` in the
   same change (Vercel Hobby's cron would otherwise keep firing the same
   jobs against the same Mongo data) — don't do this ahead of cutover, since
   Vercel is still serving production until this step.
3. In Cloudflare DNS, change the `www` and apex `karaoq.live` records from
   the current Vercel A/CNAME (DNS-only, grey cloud) to a **proxied** CNAME
   pointing at the tunnel (`<TUNNEL_ID>.cfargotunnel.com`, orange cloud).
4. Add a Cloudflare Redirect Rule (Rules → Redirect Rules) for the apex:
   `karaoq.live/*` → `https://www.karaoq.live/${1}`, 307, preserve query
   string. Not a `next.config.js` redirect — `next.config.js` is shared with
   Vercel, which already does this redirect itself; a second one there would
   fire there too, ahead of the locale rewrite, and drop the locale prefix.
5. In Cloudflare → Rules → Managed Transforms, enable **"Add visitor location
   headers"**. Without it, `cf-ipcity`/`cf-region`/`cf-region-code` are
   absent and `requestGeo()` falls back to country-only.
6. Watch `journalctl -u karaoq -f` and the admin dashboard for traffic
   arriving.

Vercel stays deployed as the fallback. To roll back the cutover, flip the
`www`/apex records back to DNS-only pointing at Vercel, remove the Redirect
Rule, and restore `vercel.json`'s `crons` — no VM or app change needed.
