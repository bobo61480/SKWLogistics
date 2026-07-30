# StyleKorean Logistics Planner backup

This repository is a complete source backup for the dashboard at
`https://stylekorean.dpdns.org/`. It preserves the original Git history and
contains the source, lockfile, build scripts, tests, Sites configuration,
deployment bundle, and related shipment-email automation definition needed for
recovery.

## Export snapshot

- Exported: 2026-07-30 America/Los_Angeles
- Sites project: `appgprj_6a6972fb69c88191aacde06b2d215270`
- Public URL: `https://stylekorean.dpdns.org/`
- Production version at export: Sites version 17
- Latest saved version: Sites version 18
- Latest source commit: `26ed54f9cfac1eb119be842f88407c19b88279b2`
- Version 17 source commit: `f82dbcccb831f3f24d994eccd8c2caa568115227`
- Git tags: `sites-version-17` and `sites-version-18`

Version 18 contains the separate Nationals and WMS wholesale sales KPI cards.
It was saved but not deployed to the public site at the time of this export.

## Included

- `app/`, `worker/`, `db/`, and `drizzle/`: application and runtime source
- `scripts/`: install, build, validation, and backup-push helpers
- `tests/`: regression checks
- `public/`: static assets
- `.openai/hosting.json`: existing Sites project binding
- `package.json` and `package-lock.json`: reproducible JavaScript dependencies
- `deployment/sites-version-18.tar.gz`: validated Sites deployment bundle
- `deployment/manifest.json`: release provenance and checksums
- `ops/automations/`: export of the recurring shipment-email processing task
- Full `.git` history inherited from the Sites source repository

Generated dependency and runtime folders such as `node_modules`, `dist`,
`.wrangler`, and `.sites-runtime` are intentionally excluded from Git. They can
be recreated from the source and lockfile.

## Restore and verify locally

Requirements:

- Git
- Node.js 22.13 or newer
- npm
- Git Bash on Windows

From the repository root:

```powershell
npm ci
npm run build
node --test tests/rendered-html.test.mjs
bash scripts/validate-artifact.sh
```

The build is valid when `dist/server/index.js`,
`dist/.openai/hosting.json`, and the application assets are present and all
tests pass.

## Push this backup to another Git repository

The original Sites source is retained as the `sites-origin` remote. To add and
push to a separate backup repository:

```powershell
.\scripts\push-backup.ps1 -RepositoryUrl "https://github.com/OWNER/REPOSITORY.git"
```

The script pushes the `main` branch and both Sites version tags. Authentication
must already be configured for the destination provider.

## Redeploy

### Restore the existing Sites project

Keep `.openai/hosting.json` unchanged to target the existing Sites project.
Build and validate the exact source commit, package it with the Sites packaging
helper, save a Sites version, and deploy that saved version. The site is public,
so production deployment requires explicit approval.

### Create an independent replacement

Do not reuse the existing `project_id` for a separate replacement site. Start a
new Sites project through the Sites creation flow and persist the newly returned
project ID in `.openai/hosting.json` before saving or deploying a version.

### Reuse the packaged release

`deployment/sites-version-18.tar.gz` is the validated bundle built from
`sites-version-18`. Verify its SHA-256 value against
`deployment/manifest.json` before use.

## External dependencies

The application reads live data from these Google Sheets:

- Logistics Master 2026:
  `1M-vZ24Yw4ZN7R7b_473cVn8kny8DznTakSsD3VQsCzc`
- National/IHERB/MBX Dimensions:
  `12Aty04yiLPPqz06AFDM8Y1Log2jEOqdXDqwiUV5yVX8`
- WMS Promotion:
  `14lH9SQzTLj8MR7UbxMfkoTDDlzhPoE8CqHV3IpK450I`

Status writes are routed through `/api/status` to the Google Apps Script
endpoint defined in `worker/index.ts`. A restored deployment needs network
access to those Google resources, and the source workbooks must remain readable
by the application.

The repository contains no copied Gmail messages, shipment attachments, Google
Drive documents, API keys, short-lived Sites credentials, or Google account
tokens. Those services must be reconnected separately.

