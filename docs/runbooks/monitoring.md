# Monitoring

## In-VM health check

`deploy/ops/error-spike.sh` curls `/api/health` on `127.0.0.1:3000` every 5
minutes (`karaoq-error-spike.timer`). It keeps no state across more than one
failure window: the first failure writes `/var/log/karaoq/error-spike.state`
and does nothing else; a second consecutive failure posts to
`https://ntfy.sh/$NTFY_OPS_TOPIC` (if set) and clears the state file, so the
next failure starts the two-strikes count over — unless that post itself
fails, in which case the state file is left in place so the very next run
retries the alert rather than waiting for two more failures. It never
touches the database — `/api/health` itself is what checks Mongo.

`karaoq-error-spike.service` also has `OnFailure=karaoq-notify@%n.service`:
if the unit itself fails outright (not a handled health-check failure — an
actual bug or permission error), that template unit (`deploy/ops/notify.sh`)
posts the same way, so a broken alerting script doesn't go unnoticed.

```
sudo mkdir -p /opt/karaoq/deploy/ops
sudo install -D -m 755 deploy/ops/error-spike.sh /opt/karaoq/deploy/ops/error-spike.sh
sudo install -D -m 755 deploy/ops/notify.sh /opt/karaoq/deploy/ops/notify.sh
sudo cp deploy/ops/karaoq-error-spike.service /etc/systemd/system/
sudo cp deploy/ops/karaoq-error-spike.timer /etc/systemd/system/
sudo cp deploy/ops/karaoq-notify@.service /etc/systemd/system/
sudo $EDITOR /etc/karaoq/ops.env   # NTFY_OPS_TOPIC=... (optional — unset means log-only)
sudo systemctl daemon-reload
sudo systemctl enable --now karaoq-error-spike.timer
```

`NTFY_OPS_TOPIC` is separate from `NTFY_TOPIC` (the suggestion-corpus quota
alerting) and separate from quota-trip paging, which the owner has
deliberately left disabled. Site-down alerts here are opt-in: leave
`NTFY_OPS_TOPIC` unset and failures just get logged to the systemd journal
(`journalctl -u karaoq-error-spike`).

## External uptime monitoring

Set up a free [UptimeRobot](https://uptimerobot.com) HTTP(s) monitor:

- URL: `https://www.karaoq.live/api/health`
- Keyword monitor, expected keyword: `"ok":true`
- Interval: 5 minutes (free tier minimum)

This is independent of the in-VM check above — it catches cases where the
VM, the tunnel, or DNS itself is unreachable, which a check running on the VM
can't see. Alerts route to whatever UptimeRobot contact method is configured
on the account; this is also opt-in and not wired to anything else in this
repo.
