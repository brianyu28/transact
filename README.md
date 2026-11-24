# Transact

A fast, information-dense personal finance and budgeting app that runs entirely in your browser.
Your data stays in a JSON file you own. There's no account, no server and no tracking.

**Features**

- Transactions across bank, credit card and investment accounts, with categories, tags, splits and transfers
- Monthly, annual and tag-based custom budgets, with rollover
- Statement reconciliation
- Net worth tracking and reports
- Income, tax and deduction planner, including two-earner households
- Optional passphrase encryption and Dropbox sync with automatic merging
- Installable PWA that works offline on desktop, tablet and phone, with keyboard shortcuts throughout

Try it without any data via **Try with demo data** on the welcome screen.

## Development

Requires Node 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev      # start the dev server
pnpm check    # typecheck, lint, format check, test, build
```

The production build (`pnpm build`) is a static site in `dist/` that can be served by any static host.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the app works and
[AGENTS.md](AGENTS.md) for conventions and rules when contributing.

## Deployment (Cloudflare Workers)

The app is deployed as a Cloudflare Worker that serves only static assets
([`wrangler.jsonc`](wrangler.jsonc)). No Worker code runs, and static asset requests are free and
unlimited on Cloudflare's free plan.

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**, and pick
   the GitHub repository.
2. Set the build command to `pnpm build` and the deploy command to `npx wrangler deploy`.
   Optionally, add a `VITE_DROPBOX_APP_KEY` build variable (see below).
3. After the first deploy, go to the Worker's **Settings → Domains & Routes → Add → Custom
   domain**, and enter a subdomain of a zone in your account. Cloudflare creates the DNS record
   and certificate.

Every push to the production branch then redeploys. To deploy by hand, run
`pnpm build && npx wrangler deploy`.

## Dropbox sync (optional)

Transact can keep the data file in Dropbox so it can be used from several devices. It talks
to Dropbox directly from the browser (OAuth with PKCE, no server) and only has access to its
own app folder (`Apps/Transact Finance` for the hosted app). Edits saved from two devices are merged.

1. Create an app at <https://www.dropbox.com/developers/apps>: Scoped access, App folder. Dropbox
   names the folder after the app (`Apps/<app name>`); if yours isn't "Transact Finance", update
   `DROPBOX_FOLDER` in `src/persistence/adapters/dropbox.ts` so the app shows the right location.
2. Under Permissions, enable `files.metadata.read`, `files.content.read` and
   `files.content.write`.
3. Under OAuth 2 → Redirect URIs, add each URL the app is served from, e.g.
   `http://localhost:5173/` and your deployed URL (with the trailing slash, without `#/…`).
4. Provide the app key at build time (`VITE_DROPBOX_APP_KEY=… pnpm build`, or in `.env.local`
   for `pnpm dev`), or paste it under Settings → Storage on each device.

The app key is not a secret; PKCE needs no client secret.

## Encryption (optional)

Settings → Storage → Encrypt with a passphrase writes the file as AES-256-GCM, with the key
derived from the passphrase by PBKDF2-SHA-256 (600,000 iterations). A lost passphrase can't be
recovered. Each device can remember the key (as a non-extractable key in IndexedDB) so it
doesn't ask every time.

## License

[MIT](LICENSE)
