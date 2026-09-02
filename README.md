# ZK Allowlist — Midnight Network

Privacy-preserving membership proofs on Midnight. Compact smart contract + Next.js frontend + CLI.

## Quick Start

```bash
npm install
npm run dev -- --webpack
```

Open [http://localhost:3000](http://localhost:3000). Connect 1AM wallet (preview network).

## What's Here

- **Next.js frontend** (`app/`, `lib/`, `contexts/`) — Deploy, Members, Admin, Verify & Use
- **Compact contract** (`midnight-allowlist/contracts/zk-allowlist.compact`) — Merkle depth 10
- **CLI** (`midnight-allowlist/src/zk-cli.ts`) — 9 commands for local dev + on-chain interaction
- **144 tests** (`midnight-allowlist/tests/`) — Vitest + fast-check

See [midnight-allowlist/README.md](midnight-allowlist/README.md) for full docs.

## Network

**Preview** — [docs.midnight.network/relnotes/network](https://docs.midnight.network/relnotes/network)

## Stack

| Component | Version |
|-----------|---------|
| Compact | 0.5.1 |
| Compact runtime | 0.16.0 |
| compact-js | 2.5.1 |
| Midnight.js | 4.1.1 |
| Wallet SDK | 1.2.0 |
| Next.js | 16.3.4 |
