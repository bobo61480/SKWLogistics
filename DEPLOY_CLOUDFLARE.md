# Cloudflare Workers deployment

This repo is the source of truth for the StyleKorean logistics board.

The Cloudflare Worker `stylekorean-logistics-planner` builds from `main` on every push:

- Build command: `npm run build` (runs `vinext build`, then validates `dist/server/index.js`)
- Deploy command: `npx wrangler deploy -c wrangler.deploy.toml`
- Non-production branches: `npx wrangler versions upload -c wrangler.deploy.toml`

`wrangler.deploy.toml` is deploy-only config. Local dev still uses the inline
binding config in `vite.config.ts` via `@cloudflare/vite-plugin`, so the two do
not conflict.

The live hostname `stylekorean.dpdns.org` is a proxied CNAME in Cloudflare DNS.
Until it is repointed at this Worker it still resolves to the old
`chatgpt.site` host, and changes pushed here will not appear on it.
