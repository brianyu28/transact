# Transact

A fast, information-dense personal finance and budgeting app that runs entirely in your browser.
Your data stays in a JSON file you own. There's no account, no server and no tracking.

> Early development. Not usable yet.

**Planned features**

- Transactions across bank, credit card and investment accounts, with categories, tags, splits and transfers
- Monthly, annual and tag-based custom budgets, with rollover
- Statement reconciliation
- Net worth tracking and reports
- Income, tax and deduction planner
- Installable PWA that works offline on desktop, tablet and phone, with keyboard shortcuts throughout

## Development

Requires Node 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev      # start the dev server
pnpm check    # typecheck, lint, format check, test, build
```

The production build (`pnpm build`) is a static site in `dist/` that can be served by any static host.

See [AGENTS.md](AGENTS.md) for architecture and conventions.

## Dropbox sync (optional)

Transact can keep the data file in Dropbox so it can be used from several devices. It talks
to Dropbox directly from the browser (OAuth with PKCE, no server) and only has access to its
own app folder. Edits saved from two devices are merged.

1. Create an app at <https://www.dropbox.com/developers/apps>: Scoped access, App folder.
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
