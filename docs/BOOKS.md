# Should the engine "learn" the 47 books?

**Short answer: no, not by feeding it the books. Yes, by building a few specific methods from them.** Each one would go through the same Vault tests as everything else.

## Why not feed the books in

1. **The engine doesn't learn from text.** The Arena, Forge and Vault search over price data and keep only what survives held-out data, costs and a luck adjustment. A book has no edge to give that the data doesn't already confirm or reject. Most of the classic rules in these books are public and long since arbitraged away, and the Vault would show that.
2. **More ideas means a higher bar, not more edge.** Every rule tried counts as a trial and raises the Forge's acceptance bar and the Vault's luck adjustment. Pouring in hundreds of book rules without a reason to expect them to work makes the next real find harder to accept. The Forge's 0-of-109 result shows this already.
3. **Copyright.** We don't have rights to load these books into an AI or ship their text, and we shouldn't. Ideas and methods are free to implement in our own code, with credit; the text is not.
4. **Wrong market.** About half the list is about stock fundamentals (Graham, Lynch, financial statements), options (Hull, Natenberg, Wilmott) or market background (Hazlitt, *Flash Boys*). The engine trades FX and gold from price data. Those books matter for the multi-asset work (§11A), and only once there is data for them.

## What is already in the engine, from these authors

| Method | Source | Where |
|---|---|---|
| Deflated Sharpe Ratio (luck adjustment for many trials) | López de Prado, *AFML* (with Bailey) | Vault Exam |
| Purged, embargoed splits (no leakage across the train/test line) | *AFML* ch. 7 | `splits.ts` |
| Stop/target outcomes per trade (triple-barrier style labels) | *AFML* ch. 3 | `outcomes.ts` |
| Information coefficient, shrinkage toward the pooled mean | Grinold & Kahn, *Active Portfolio Management* | Core v1, Forge |
| Execution costs learned from your own fills | Kissell; Johnson, *Algorithmic Trading and DMA* | Mirror |
| Prop-style drawdown rules, risk per trade in R | Carver, *Leveraged Trading*; Vince | Prop rules, Challenge Odds |

## Worth building (ranked by value per effort)

1. **Effective number of trials** (López de Prado, *Machine Learning for Asset Managers*, ch. 8). Similar strategies are grouped into clusters, and each cluster counts once in the luck adjustment. Today every trial counts fully, which is honest but harsh. This makes the Vault fairer without making it softer. *Small, high value.*
2. **Random-entry baseline** (Davey, *Building Winning Algorithmic Trading Systems*). The Vault also reports how random entries with the same stops, targets and trade count would have done, the "monkey test". It sits next to the default-TDCI baseline the Vault already shows. *Small.*
3. **Ehlers filters as Forge operations** (*Cycle Analytics for Traders*): the super smoother and the roofing filter. They become new building blocks in the layer language, and anything built from them still has to pass the same acceptance test. *Small, also lands in the Layer Kit.*
4. **Kaufman's efficiency ratio** (*Trading Systems and Methods*) as a Forge operation and a regime input. *Small.*
5. **Volatility-targeted sizing** (Carver, *Systematic Trading*). An optional Blueprint risk mode that scales position size to recent volatility instead of a fixed % risk, so each trade risks a similar amount in volatility terms. *Medium.*
6. **Combinatorial purged cross-validation** (*AFML* ch. 12). It gives many backtest paths through the training data instead of one, so the Arena can prefer strategies that hold up across all of them. *Medium, raises compute.*
7. **Meta-labeling** (*AFML* ch. 3). A second model learns when to *skip* the strategy's own signals. Powerful, but it is a second fitted model with its own overfitting risk. It needs its own Vault-style test, so build it after 1–6. *Large.*

Not recommended:
- **Kelly / optimal f as default sizing** (Vince). The book itself shows how fragile it is to estimation error. At most, show it as a warning.
- **Fractional differentiation as a layer.** It needs very long histories and adds little at our timeframes.

## A "Library" for users (optional)

A reading guide inside the Learn section: per category, 2–3 books, each with one sentence *in our own words* on which Trade Depot system relates to it. No quotes or summaries of the books' content. This is content work, not engine work.

## Recommendation

Build items 1–4 as one small "methods from the literature" step, with tests, each credited in DECISIONS.md. Hold 5–7 until there is a Licensed strategy to compare against. Don't ingest any book text.
