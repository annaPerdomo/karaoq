# Branch protection on `main`

## Why

`main` currently accepts direct pushes, and nothing gates a PR — a failing
typecheck, lint, test, or build can land. `.github/workflows/ci.yml` runs
those checks on every pull request and on every push to a non-`main` branch;
requiring that check on `main` turns "pre-push hook on one laptop" into a gate
GitHub enforces for every contributor, including the repo admin.

This repo is solo-maintained, so required approvals stay at 0 — the point is
the status check, not a second reviewer. Linear history and no force-pushes
keep `main`'s history readable and keep a force-push from silently discarding
a commit a required check already passed.

## Enable it

```bash
gh api -X PUT repos/annaPerdomo/karaoq/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["checks"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

`required_status_checks.contexts` names the `checks` job in
`.github/workflows/ci.yml` — that job must have run at least once (on a PR or
a push to a branch) before GitHub will let it be required.

`enforce_admins: true` means no one, including the repo owner, can push
straight to `main` or merge a PR with a red `checks` run.

Not run as part of this change — out of scope for this prompt.

## Emergency bypass

If `main` needs a direct push or a merge with a failing check (a hotfix, a
revert when CI itself is broken), temporarily relax enforcement rather than
deleting the protection rule:

```bash
# Turn off admin enforcement so the repo owner can push around the check
gh api -X DELETE repos/annaPerdomo/karaoq/branches/main/protection/enforce_admins
```

Re-enable it immediately after:

```bash
gh api -X POST repos/annaPerdomo/karaoq/branches/main/protection/enforce_admins
```

Leaving `enforce_admins` off is the only bypass — the required status check
and linear-history rule stay in place for everyone else the whole time.
