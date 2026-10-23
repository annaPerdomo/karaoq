# Deploy and rollback

## When to use

Shipping a change to staging or production, or undoing a bad one.

## Steps

Deploy via "Deploy to VM" (`workflow_dispatch`):

```
gh workflow run deploy-vm.yml -f ref=<branch-or-sha> -f target=staging
gh workflow run deploy-vm.yml -f ref=main -f target=production
```

Staging also deploys automatically on push to the `staging` branch. Each run:
tests → builds the standalone bundle → ships it to the VM → runs
`karaoq-activate` (atomic symlink swap + health check, see `deploy/README.md`
"Deploy") → runs the smoke suite against the target it just activated. A
production run that activates cleanly but fails smoke rolls itself back
automatically (next section). On success against `production`, a second job
tags the deployed sha and publishes a GitHub Release (see
`docs/engineering/README.md`).

## Verify

```
curl https://next.karaoq.live/api/health            # staging, once DNS points there
ssh <vm> 'curl -s http://127.0.0.1:3000/api/health'  # production, before DNS cutover
```

Expect `{"ok":true,...}`. Check the run's "Activate" and "Smoke test" step logs for details.

## Rollback

Automatic: a failed post-deploy smoke test against `production` runs
`karaoq-activate --rollback production` for you — no action needed, just
confirm the workflow run shows the rollback step and re-check health above.

By hand (bad release noticed later, or staging):

```
ssh <vm>
sudo karaoq-activate --rollback production   # or: staging
```

This points `current` back at the release before the one now active (from
`$BASE/history`), restarts the service, and health-checks the result; if the
prior release also fails health, it reverts to what was running before the
rollback attempt and exits non-zero. Full mechanics: `deploy/README.md`
"Roll back by hand".
