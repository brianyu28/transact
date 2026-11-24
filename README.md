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

## License

[MIT](LICENSE)
