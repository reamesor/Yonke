# Monke

Colors betting on warm paper. Same money math as Midway Colors. Different brand.

Play: pick 1–3 pastel ghosts, set a unit bet, place, roll three dice. Each color settles alone (`PER_COLOR`). Every roll takes a 5% cut of bet cost — win or lose — split 40/40/20 burn / believers / build. Wins pay the full 2× / 4× / 6× ladder.

## Modes

- **DEMO** — local 10 SOL pot, same math, no chain
- **DEVNET** — connect wallet → Sign-In-With-Solana → deposit → play → withdraw. Never mainnet.

DEVNET custody stays off until env is set (`NEXT_PUBLIC_SIWS_ENABLED`, `NEXT_PUBLIC_DEVNET_CUSTODY`, `HOUSE_WALLET_SECRET_KEY`, Upstash on Vercel).

## Scripts

```bash
npm run dev
npm run check:colors
npm run build
```

## Fairness

Commit–reveal: `hash(serverSeed:nonce)` before the roll, HMAC-SHA256 dice on reveal. Client verify on the play surface.
