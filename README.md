# Transact

[Transact](https://transact.brianyu.me/) is a personal finance and budgeting application that runs entirely in your browser.

Your data is private and always yours: Transact has no servers and no accounts. Your data is kept in a single file that you own.

**Features**

- Record transactions across different accounts, with categories, tags, splits, and transfers
- Create budgets on a per-year, per-month, or one-off basis
- Reconcile account statements
- Income and spending tracking and reports
- Income, tax, and deduction planner
- Optional AES-256-GCM encryption
- Optional Dropbox sync
- Installable PWA that works offline on desktop, tablets, and phones

[Try Transact](https://transact.brianyu.me/) by creating a new file or using **Try with demo data** on the welcome screen.

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

## License

[MIT](LICENSE)
