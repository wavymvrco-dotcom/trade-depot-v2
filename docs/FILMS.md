# System films — narrated explainers built in Blender

**Version history**
- **v1** (paper-white pucks and ribbons) was rejected as bland.
- **v2** ("Night Lab" visuals) was rejected for not explaining anything.
- **v3, current:** each system is a **narrated explainer of 40–65 seconds**. It has a title card, a hook that names the problem, one visual beat per spoken line, on-screen captions with keywords highlighted, callouts with leader lines, live counters and gauges, a payoff and an end card. All of it is checked against how the engine actually works, and none of it shows P&L.

## What each film explains

| Film | The story it tells | Markets shown |
|---|---|---|
| **Arena** | Skill or luck? One strategy (the Probe) on one market history, then **144 worlds** running at once (different markets, stretches of history, costs and missed fills). The weakest are wiped out, the strongest are copied with mutated settings (shown as a settings panel), over **12 generations** with **1,728 versions counted**. The champion heads to the Vault. | EURUSD, NVDA, Gold, Crude oil, AAPL, S&P 500 |
| **Gauntlet** | The **Hunter** drone attacks the stop loss with a **GAP** and a **SPREAD ×5** blowout. Then **Storm Mode**: 200 simulated worlds (reshuffled history, regime shifts, earnings gaps, spread blowouts). A gauge counts 192 of 200 worlds inside the drawdown limit against the 95% notch: **STORM PASSED**. | AAPL; gold, oil and stocks in the storm |
| **Vault Exam** | The cheat (peeking at the future). The **60/20/20 split** with the last 20% locked under glass. A vault door opens **once**. The candles are revealed only as the strategy passes. **Five laser gates** tick a checklist. The grades are shown, and the door seals at *openings: 1 / 1*. | NVDA, 10 years |
| **Shadow Run** | History versus the live market. Each decision is **locked above the empty slot before the candle exists**. The champion trades beside it. Results drop into a permanent record, and an evidence meter crosses the promotion line: **PROMOTED TO LIVE**. | Gold (XAU/USD) |
| **Licensed** | The gold seal is stamped on. The **tripwire** laser watches two gauges (drift from the Vault's promise, and drawdown versus the deepest seen in the Vault). A wick touches the wire, the alarm fires, the licence is pulled, and the strategy goes back to the Shadow Run rack. | Gold |
| **Mirror** | A perfect fill versus real fills on a 3D price ladder, showing **slippage** and the **spread**. The misses build a histogram of your costs on a mirror, the same-broker average fills the gaps, a weight slider moves toward your own data, and the model beams into the Arena. | EURUSD, AAPL, Crude oil |
| **Forge** | The **layers** rack. Safe pieces snap into a **formula tree** that is tested in a chamber (prediction versus what happened next). The required score bar **rises with every idea tried** (3.00 → 3.49). **109 tried · 0 accepted · best \|t\| 1.69**. An empty slot waits for the first layer to earn its place. | — |
| **Playbook · Hive · Fleet** | Skills are shelved by market weather and seed new runs. Orbs over a live chart are scored and merge into the **Hive** (*P(up) 58% · 7 contributors · context, not a signal · needs 5*). **Fleet** weights (45/35/20) sit on a gimballed platform that absorbs shocks. | S&P 500 |
| **Proof of Process** | Claim versus check. Hash blocks chain **before outcomes**. Editing one entry breaks every later link. At **00:00 UTC** the day folds into one Merkle seal. **Verify** in the browser ticks the real verifier's checks. | — |

> Stocks and commodities appear because the build sheet's multi-asset plan (§11A) covers them. Before the films are published, stocks and oil need to actually be tradable in the product (data provider, broker and legal review are still open). Until then, either hold the films back or trim those labels.

## Pipeline

| Step | What | Where |
|---|---|---|
| Script | Narration lines (also the captions); `*words*` are highlighted | `films/narration.json` |
| Voice | Australian neural voice, one WAV per line | `films/blender/tts.py` → `films/vo/<id>/NN.wav` |
| Scene | Each line's start frame drives that beat's animation; timings follow the WAVs when present | `films/blender/<id>.py` (shared kit: `studio2.py`) |
| Check | Contact sheet of key frames, with the caption overlay composited | `films/blender/preview.py` |
| Render | 3D frames, then the flat caption overlay (alpha), then MP4 (H.264) + WebM (VP9) + WebP poster, with the voice mixed in | `films/blender/render.py`, `queue.sh` |
| Publish | Upload `films/out/*` to the film CDN and set `VITE_FILMS_CDN_URL` | `client/src/content/films.ts` |

**Visual language "Night Lab":** a dark glossy floor with a fading cyan grid, haze and bloom. Markets are 3D candlesticks; strategies are Probes whose glowing core colour shows their state. Colours mean state: cyan = active, teal = passed, amber = caution, red = failed, gold = Licensed only. Captions render in a separate flat layer, so the 3D scene never hides or blurs them.

## The voice-over (needs a key)

There is no Australian voice installed on this PC. `tts.py` supports either provider:

- **Azure Speech:** set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`. The voice is `en-AU-WilliamNeural` (or set `AZURE_VOICE=en-AU-NatashaNeural`). The free tier covers all nine films.
- **ElevenLabs:** set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`, choosing an Australian voice in their library. A paid plan is needed for commercial use.

Put the keys in `.env.local`, then run each step in order:

```bash
python films/blender/tts.py
```

```bash
for f in arena gauntlet vault shadow licensed mirror forge hive proof; do "/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python films/blender/$f.py; done
```

```bash
rm -f films/out/*.mp4 films/out/*.webm films/out/*.webp
```

```bash
bash films/blender/queue.sh arena gauntlet vault shadow licensed mirror forge hive proof
```

The scenes re-time themselves to the recorded audio, and render.py mixes the voice in (AAC in the MP4, Opus in the WebM).
