# T11 manifest renderer v1

This branch preserves `index.html` as the recovered QA reference and adds a reusable manifest-driven path at `/t11.html?manifest=/manifests/<file>.json`.

## Contract
- The HTML/CSS page geometry stays fixed at the recovered 1600x1000 two-page Golden Master topology.
- The renderer consumes already-computed presentation content, sourced candles, and plotted price lines from a signed production manifest.
- The renderer does not calculate PO3, MMxM, AMD, CSD, SMT, MSS, liquidity state, PD arrays, DOLs, or invalidations.
- Empty candle arrays render as unavailable; they are never replaced with synthetic candles.
- `index.html` remains untouched for regression comparison.

## QA sequence
1. Build the branch.
2. Render `index.html` and `t11.html?manifest=/manifests/aapl-golden.json` at 1600x1000.
3. Compare final-object geometry and content.
4. Only after parity passes, use new signed asset manifests for batch production.
