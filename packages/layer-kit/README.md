# Layer Kit

Write your own **layer** for Trade Depot: a small program that reads price bars and outputs a number between −1 (bearish) and +1 (bullish). Accepted layers join the Arena, where strategies can learn to use them.

A layer is **data, not code**. You write it as a JSON tree in a tiny language. Trade Depot checks it against the grammar and evaluates it with its own interpreter, which only reads bars up to the current close. Nothing you submit is ever executed. This kit contains the same grammar and interpreter the platform runs, so what you see locally is what the platform computes.

## Try it

```bash
npx tsx src/cli.ts sample candles.csv
npx tsx src/cli.ts run examples/mean-reversion.json candles.csv
```

```
layer     clamp(neg(zscore(close, 20)), -1, 1)
size      5 nodes, depth 4
bars      2000 (first 19 are warmup and read as 0)
values    mean …, spread …, non-zero 99%, last …
future    safe: changing later bars never changed an earlier value
local IC  … vs the next 10 bars, t ≈ … (unofficial)
```

Commands:

| Command | What it does |
|---|---|
| `grammar` | Prints the layer language |
| `validate <layer.json>` | Checks the grammar and limits (depth ≤ 6, ≤ 40 nodes, windows 2–200, root clamped to [−1, 1]) |
| `run <layer.json> <candles.csv> [--horizon 10] [--htf 4]` | Evaluates the layer, checks it can't see the future, and gives a local predictive check |
| `sample [out.csv]` | Writes synthetic candles to experiment on |

Your CSV needs a header with `time, open, high, low, close`. `--htf 4` builds the higher timeframe from every 4 bars.

## How a layer is accepted

You submit a layer in the app: **Lab → Forge → Submit your own layer**. It goes through exactly the same test as layers the Forge invents.

1. **Predictive on training data.** On the platform's training split only (the Vault is never touched), its rank correlation with the forward move must clear a t-statistic bar of **max(3, Φ⁻¹(1 − 0.025 / layers tried))**. The bar rises with every layer anyone has tried, so a lucky find among thousands doesn't get in.
2. **New.** It must not be a near-copy (|ρ| ≥ 0.7) of a built-in or already-accepted layer.
3. **Simple.** Each node costs a little, so a simpler layer beats a complicated one that predicts the same.
4. **Reads the market and can't read the future.** Constant programs are refused, and the interpreter can't look ahead.

The local IC in this kit is a sanity check on your own data. It is not that test.

## License

See [LICENSE](LICENSE). The owner will choose the license; until then no license is granted.
