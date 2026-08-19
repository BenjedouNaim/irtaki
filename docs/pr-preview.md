# PR Preview Environments — Requirements & Deferred Status

**Feature:** F-FND-05 (EPIC-00 Foundation)
**Status:** NOT YET WIRED — this document captures what CI and Coolify need so wiring is a one-session task in EPIC-12.

---

## What a PR Preview environment is

A short-lived copy of the backend (NestJS + Postgres) spun up per pull request, reachable at a public URL, so reviewers and the mobile app can test the PR branch against a real API without touching the shared dev server.

**This project is single-tenant and single-center by design** (SA.md ADR-014). PR Preview envs are therefore also single-tenant throwaway instances — no shared state between previews.

---

## Why it is not wired yet

The Coolify VPS pair has not been provisioned yet. That is explicitly outside this plan (Development Plan DPQ-09, AGENTS.md §15). Until the VPS exists, there is nothing to deploy to. When it is ready, EPIC-12 picks this up.

---

## What Coolify needs (infrastructure side)

When the Coolify VPS is provisioned (EPIC-12), the operator must:

1. Create a **Coolify Application template** for the backend container (using the `backend/Dockerfile` built in F-FND-05).
2. Create a **Coolify Database resource** (Postgres 16) that can be cloned per PR preview — or use a single shared preview DB with per-PR schema namespacing.
3. Expose a **Coolify API token** and the target server/application IDs as GitHub Actions secrets (see §4 below).

---

## What GitHub Actions needs (CI side)

A new workflow file (to be created in EPIC-12) — suggested path: `.github/workflows/pr-preview.yml`.

### Trigger
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]
    paths:
      - backend/**
```

### Secrets required
| Secret name | Value |
|---|---|
| `COOLIFY_API_TOKEN` | Personal access token from the Coolify instance |
| `COOLIFY_SERVER_URL` | Base URL of the Coolify API (e.g. `https://coolify.irtaki.example.com`) |
| `COOLIFY_APP_ID` | Application resource ID for the PR Preview backend app |
| `COOLIFY_DB_ID` | Database resource ID for the PR Preview Postgres |

These must be added as **GitHub Actions repository secrets** (Settings → Secrets → Actions).

### Env vars injected per PR
The workflow must inject at minimum:
```
NODE_ENV=staging
PORT=3000
DB_HOST=<preview-db-host>
DB_PORT=5432
DB_NAME=irtaki_pr_<PR_NUMBER>
DB_USER=<preview-db-user>
DB_PASS=<preview-db-pass>
JWT_ACCESS_SECRET=<randomly generated per PR, stored as Coolify env var>
JWT_REFRESH_PEPPER=<randomly generated per PR, stored as Coolify env var>
LOG_LEVEL=info
# Mailgun + FCM: use sandbox/test values in preview — no real emails or push
MAILGUN_API_KEY=<sandbox key>
MAILGUN_DOMAIN=<sandbox domain>
FCM_SERVICE_ACCOUNT_JSON=
```

### Deploy step (on PR open/sync)
```yaml
- name: Deploy PR Preview
  if: github.event.action != 'closed'
  run: |
    curl -s -X POST "${{ secrets.COOLIFY_SERVER_URL }}/api/v1/applications/${{ secrets.COOLIFY_APP_ID }}/deploy" \
      -H "Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d '{"pullRequestId": "${{ github.event.pull_request.number }}"}'
```

### Teardown step (on PR close/merge)
```yaml
- name: Teardown PR Preview
  if: github.event.action == 'closed'
  run: |
    curl -s -X DELETE "${{ secrets.COOLIFY_SERVER_URL }}/api/v1/applications/${{ secrets.COOLIFY_APP_ID }}/preview/${{ github.event.pull_request.number }}" \
      -H "Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}"
```

---

## Mobile side

The mobile app reads `EXPO_PUBLIC_API_BASE_URL` at bundle time (see `mobile/.env.example`). For a PR Preview:

- The preview URL pattern is `https://pr-<NUMBER>-api.irtaki.example.com/api/v1` (exact domain TBD when VPS is provisioned)
- The mobile build that tests a PR branch must be started with `EXPO_PUBLIC_API_BASE_URL` set to the preview URL
- This is a manual step for now (developer sets `.env` locally and runs Expo Go against the preview backend)
- Automated EAS Preview builds are Post-MVP (TDR-04)

---

## Production

Production deployment is EPIC-12, not this feature. No production config is implemented here. Production assumptions:
- Hosted on Tunisian VPS pair (data-residency requirement — ADR-014)
- Managed by Coolify
- Secrets set directly in Coolify environment, never committed to the repo
- `NODE_ENV=production`, real Mailgun domain, real FCM service account
- Seed guard enforced: the Qalan dataset seeder **refuses to run** when `NODE_ENV=production` (verified in EPIC-00 F-FND-06)
