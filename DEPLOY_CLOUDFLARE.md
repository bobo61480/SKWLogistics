# Cloudflare Workers deployment

This repo is the source of truth for the StyleKorean logistics board.

The Cloudflare Worker `stylekorean-logistics-planner` builds from `main` on every push:

- Build command: `npm run build` (runs `vinext build`, then validates `dist/server/index.js`)
- Deploy command: `npx wrangler deploy -c wrangler.deploy.toml`
- Non-production branches: `npx wrangler versions upload -c wrangler.deploy.toml`

`wrangler.deploy.toml` is deploy-only config. Local dev still uses the inline
binding config in `vite.config.ts` via `@cloudflare/vite-plugin`, so the two do
not conflict.

## Live hostname

`wrangler.deploy.toml` binds the Worker to the live hostname with a custom
domain route for `stylekorean.dpdns.org`. On deploy, Wrangler attaches that
hostname to the Worker and manages its DNS record, so the site stops resolving
to the old `chatgpt.site` Sites host.

Requirements for that binding to succeed:

- The `dpdns.org` zone must be in the same Cloudflare account as the Worker.
- Any existing `stylekorean` CNAME pointing at the old Sites host must be removed first, otherwise the deploy fails with a conflicting DNS record.
- After the first successful deploy the hostname appears under the Worker's Domains and Routes settings, and Cloudflare issues the certificate for it.

## GitHub Pages is not used

This app is server-rendered and depends on API routes and Cloudflare bindings,
so GitHub Pages cannot serve it. Pages should stay disabled for this repo and no
`CNAME` file should be added, because a Pages custom domain would compete for
the same hostname as the Worker custom domain. `.github/workflows/nextjs.yml`
is a leftover Next.js Pages sample workflow and can be deleted.
