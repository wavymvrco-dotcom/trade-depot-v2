# System films — build prompts (Blender)

One 20-second loop per system, plus a 90-second overview. They are built in Blender through the Blender MCP. Each prompt below is written to be pasted as-is ("build film: Arena"). Files go to the film CDN (`VITE_FILMS_CDN_URL`) as `<id>.mp4`, `<id>.webm` and `<id>.webp` (poster), and register in `client/src/content/films.ts`.

## Style bible (applies to every film)

The reference is the look of robot-learning simulation reels: **many copies of the same experiment running side by side**, shown cleanly. Nothing here copies any company's footage, logos or assets.

- **Scale through repetition.** Open on one environment, then pull back to reveal a grid of 64–1,024 copies running at once, each slightly different (different market data, different seed). This is the core image: the Lab tests at scale.
- **Clean studio world.** Matte off-white floor (the brand ground `#F4F1EA`) with a faint 1 m grid, soft area light from above-left, gentle ambient occlusion, a shallow depth of field on close-ups. No skybox and no clutter.
- **Colour means state.** Ink-navy `#1F3A5F` for neutral or unknown. Teal-green for passing, used sparingly. Clay red `#8C2F22` for failing or scrapped. Amber `#8A4B00` for probation. Gold only for the Licensed seal. Everything else is greyscale.
- **Motion.** Slow, smooth camera moves (dolly, crane, orbit) with eased starts and stops; no shake. Environments animate procedurally (sin/noise drivers), so loops are seamless: frame 600 equals frame 0.
- **Text.** At most one lower-third label per shot, set in the app's display font, added in compositing (not 3D text) so it can be translated. Captions in a `.vtt` file.
- **Honesty rule (§17.3).** No P&L, no account balances, no "profit" numbers, no upward equity curves presented as a promise. We show process: testing, rejecting, sealing. Charts are abstract shapes, never real returns.
- **Specs.** 1920×1080 at 30 fps, 600 frames (20 s). EEVEE (Next) with bloom off, soft shadows and AO on. Export H.264 MP4 (CRF 20), VP9 WebM, and a WebP poster from frame 300. Each must stay under 6 MB for the landing page.
- **Accessibility.** Each film has a `description` in `films.ts` saying what it shows. The player never autoplays with reduced motion (already handled).

Build approach: one shared Python module creates the studio, the materials, the "market tile" (a 1×1 m slab whose surface is a procedural price-line ribbon), the grid instancer and the camera rig. Each film is then a short script that uses them. Geometry Nodes instance the tiles, so a 1,024-copy grid stays light.

---

## 1. Arena — "Thousands of tries, at once" (`arena`)
**Shows:** evolution across many market worlds; the weak fade out.
- 0–4 s: Close on one tile. A small navy puck (a strategy) glides along a raised price ribbon, leaving a thin trail; it hesitates at a turn.
- 4–10 s: Crane up and back; the grid grows to 32×32 tiles, each with its own ribbon and puck, all moving at once.
- 10–16 s: A wave passes across the grid. Pucks that went off course dim to grey and sink into the floor; survivors brighten, split into two, and the copies continue (the next generation).
- 16–20 s: Settle on a wide shot with a handful of bright pucks. Ease back toward the opening framing so the loop is seamless.
- Label: "The Arena — every version is tested on many markets at once."

**Blender prompt:** "Build film: Arena. Use the shared studio. A 32×32 Geometry Nodes grid of market tiles, each ribbon from noise seeded by tile index. One puck per tile follows its ribbon via a curve parameter driven by frame. At frame 300, a radial wave from the grid centre fades the 70% of pucks with the lowest seeded fitness to grey (emission 0, sink 0.2 m over 30 frames); survivors scale-pop and duplicate along the ribbon. Camera: frames 0–120 close dolly on the centre tile at 0.6 m; 120–300 crane to 22 m high, 30° down; 480–600 ease back to the start. 600 frames, seamless loop."

## 2. Gauntlet — Hunter, Storm, Rewind (`gauntlet`)
**Shows:** the strategy is attacked on purpose before it is trusted.
- 0–6 s: One puck moves along a corridor ribbon. A small angular "hunter" drone shifts the ribbon just ahead of it: gaps, spread spikes rendered as sudden vertical fins.
- 6–12 s: The sky darkens slightly and a storm front (a translucent sheet with particle rain) sweeps across; the view pulls back to 200 corridor copies (Storm Mode's worlds). Some pucks fall off and turn red; most hold.
- 12–17 s: A counter fills a ring around the grid. It is drawn as a ring meter with no percentage shown, so it reads as a pass mark rather than a number.
- 17–20 s: Return to calm and the single corridor.
- Label: "The Gauntlet — we try to break it before you trust it."

**Blender prompt:** "Build film: Gauntlet. Corridor = a long market tile (8×1 m). A low-poly drone (octahedron, navy, small rotor discs) flies ahead and displaces ribbon vertices with a shrinkwrap/proximity Geometry Nodes field to make gaps and fins. Frames 180–360: a storm sheet (volume scatter, low density) moves along X, with particle rain; the camera pulls back to a 20×10 grid of corridors; 15% of pucks seeded to fail turn clay red and drop. Frames 360–510: a thin ring meter around the grid fills to 95%. Seamless loop."

## 3. Vault Exam — "Opened once" (`vault`)
**Shows:** data the strategy has never seen, used exactly once.
- 0–5 s: A heavy, simple vault door (cylinder, ink navy) set in a wall of stacked market tiles. Every tile is face-down (dark).
- 5–10 s: The door rotates open. One puck enters; behind it, the tiles flip face-up one by one as it passes (data revealed only now).
- 10–15 s: A row of five inspection gates the puck passes under (costs ×2, luck adjustment, baseline comparison, drawdown, trade count). Each lights green or red.
- 15–20 s: The door closes and a lock bar slides home. A small padlock icon with "1" appears.
- Label: "The Vault — data it has never seen, opened once."

**Blender prompt:** "Build film: Vault Exam. Wall = 12×6 market tiles rotated 180° (dark backs). Vault door: a 2 m cylinder with a radial bolt pattern, hinged on the left, rotating 0→100° over frames 150–240. The puck travels along an interior path; tiles flip (rotation X 180→0) when the puck's X passes them. Five arch gates along the path, emission lighting green in sequence (gate 4 flickers amber, then green). Frames 480–570: the door closes and a bolt slides. Seamless loop."

## 4. Shadow Run — "Live prices, no money" (`shadow`)
**Shows:** a translucent twin trading beside live data, compared to the incumbent.
- 0–8 s: A live ribbon builds bar by bar from left to right. A solid navy puck (the current strategy) and a glassy translucent twin ride it side by side; each decision drops a small marker pin *before* the next bar appears.
- 8–14 s: Pull back: each marker pin links to a chain of small cubes behind the ribbon (the record).
- 14–20 s: A balance beam above slowly tips toward whichever twin is doing better. It shows no numbers, only a tilt that settles.
- Label: "Shadow Run — it proves itself on live prices before any money."

**Blender prompt:** "Build film: Shadow Run. A ribbon whose visible length grows with frame (Geometry Nodes trim curve). Two pucks: solid navy and glass (transmission 1, roughness 0.05). Every 40 frames each places a thin pin (cylinder + sphere head) one bar ahead of the ribbon end; the pins then link by thin edges to a row of 8 cm cubes behind. A balance beam above tilts ±6° by a smooth driver. Seamless loop."

## 5. Licensed + Tripwire — "Earned, and watched" (`licensed`)
**Shows:** the seal, and the tripwire that can take it away.
- 0–6 s: A strategy card (rounded slab) floats in. A gold seal presses onto it and a soft light ripple runs out.
- 6–12 s: A thin laser line, the tripwire, runs beneath the card along a live ribbon. The ribbon drifts down slowly; when it touches the line, the line flashes and the card slides back to a "Shadow" shelf.
- 12–20 s: The card moves forward again, re-earns the seal (shorter beat), and the loop resets.
- Label: "Licensed — and pulled automatically if it drifts."

**Blender prompt:** "Build film: Licensed. A card mesh (0.8×0.5×0.03 m, bevelled, off-white) with a gold seal (cylinder, metallic 1, roughness 0.25, embossed ring) pressing down at frame 60. Ripple = an expanding torus with a fading emission. Tripwire = a thin emissive red cylinder at a fixed height under the card; the ribbon below drifts down from frame 200 and touches it at 300 (flash 6 frames). The card slides to a shelf 1 m left, then returns from frame 420 and re-seals at 510. Seamless loop."

## 6. Mirror — "Your real costs" (`mirror`)
**Shows:** the platform learns execution costs from real fills.
- 0–8 s: Order tickets (thin slabs) drop onto a ribbon; each leaves a tiny offset between where it was aimed and where it landed (slippage), drawn as a short red tick.
- 8–16 s: The ticks collect into a mirror plane below the ribbon, forming a soft distribution shape that sharpens as more arrive.
- 16–20 s: The mirror shape projects up into the Arena grid (a faint beam), and the pucks there slow very slightly.
- Label: "Mirror — tested with the costs you actually pay."

## 7. Forge — "New tools, held to a rising bar" (`forge`)
**Shows:** layers built from small blocks; most are rejected and the bar rises.
- 0–6 s: Small blocks (ops) snap together into a tree on a workbench.
- 6–14 s: Each finished tree is lowered onto a test plate. A horizontal bar of light sits at a height and **rises a little after every test**. Most trees fail to reach it and dissolve to dust; the counter beside it ticks up.
- 14–20 s: One tree clears the bar, glows, and slots into a rack of layers. If none clear it in a take, that is fine: the film can end on the rising bar alone, which matches today's real result.
- Label: "The Forge — new ideas must clear a bar that rises with every try."

## 8. Playbook, Hive & Fleet — "Experience, combined" (`hive`)
**Shows:** past winners kept as skills, combined carefully.
- 0–7 s: Licensed cards shelve into a "Playbook" rack, each tagged with a weather icon (calm, trend, volatile).
- 7–14 s: Many small lights (strategies' probabilities) float above a single ribbon; the brighter ones carry more weight. They merge into one soft glow (the Hive), which needs at least five lights to appear.
- 14–20 s: Three cards sit on a balance plate with weights that shift to keep the plate level under small shocks (the Fleet).
- Label: "Playbook, Hive and Fleet — what worked, kept and combined."

## 9. Proof of Process — "Anyone can check" (`proof`)
**Shows:** decisions chained before results; daily seals.
- 0–7 s: A decision pin drops; a cube links onto a chain *before* the result bar appears. Each cube shows a short hex fragment.
- 7–14 s: At "midnight" (the light dims to blue), the day's cubes fold pairwise up into a tree, ending in one root cube.
- 14–20 s: The root cube is stamped into a long line of past roots. A magnifier passes over the chain, and every link lights green.
- Label: "Proof of Process — every decision recorded before its result."

## 10. Overview (90 s, click to play) (`overview`)
Films 1–9 edited in order (8–10 s each), with a 4 s title card at the start and a 6 s close: "Tested at scale. Opened once. Proved live. Recorded for anyone to check." No numbers.

---

## Registry
`client/src/content/films.ts` holds entries for all ten. The Landing page uses the first five; the others are ready for the Lab tabs (Forge, Licenses, Shadow) and the Learn hub.

## To build
1. Open Blender (4.2 or newer) and start the MCP add-on server (in the add-on panel: *Connect*).
2. Ask: "build film: Arena" (then the others). Each build is verified with frame checks before rendering.
3. Upload the outputs to the film CDN and set `VITE_FILMS_CDN_URL`.
