// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Film registry (build sheet §17.3). New films drop in by filling the URLs here;
// no code changes. Files live in object storage behind a CDN, never in git or
// the app bundle. A missing film falls back to its poster, then to a labeled
// placeholder frame. Honesty rule: films show process, never profits or P&L. Films are narrated
// explainers with burned-in captions (they autoplay muted), built by films/blender/*.py.

export interface Film {
  id: string;
  system: "arena" | "gauntlet" | "vault" | "shadow" | "licensed" | "mirror" | "forge" | "hive" | "proof" | "overview";
  title: string;
  /** Text alternative for screen readers: what the film shows. */
  description: string;
  posterUrl?: string;
  mp4Url?: string;
  webmUrl?: string;
  captionsUrl?: string;
  durationSec: number;
  /** Long films are click-to-play only. */
  clickToPlay?: boolean;
}

/** Base URL of the film CDN (VITE_FILMS_CDN_URL, the client-side name for FILMS_CDN_URL). */
const CDN = ((import.meta as any).env?.VITE_FILMS_CDN_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const at = (file: string) => (CDN ? `${CDN}/${file}` : undefined);

export const FILMS: Film[] = [
  { id: "arena", system: "arena", title: "The Arena", durationSec: 65,
    description: "One strategy (a glowing probe) drives across candlestick price history; the view rises to 144 market worlds — currencies, stocks, gold, oil — all running at once; the weakest versions burst red, the strongest split and mutate over twelve generations, and the champion heads to the Vault Exam. Narrated, with on-screen captions.",
    posterUrl: at("arena.webp"), mp4Url: at("arena.mp4"), webmUrl: at("arena.webm") },
  { id: "gauntlet", system: "gauntlet", title: "The Gauntlet", durationSec: 55,
    description: "A red Hunter drone attacks a strategy on an AAPL chart with price gaps and spread blowouts aimed at its stop loss; then a storm sweeps 200 simulated worlds and a gauge shows 96% staying inside the drawdown limit against a 95% bar.",
    posterUrl: at("gauntlet.webp"), mp4Url: at("gauntlet.mp4"), webmUrl: at("gauntlet.webm") },
  { id: "vault", system: "vault", title: "The Vault Exam", durationSec: 53,
    description: "The last 20% of price history is locked under glass; a vault door opens once; the strategy drives over candles revealed only as it passes, through five laser gates — costs doubled, luck adjustment, beats the default, drawdown, enough trades — then receives its grade and the door seals.",
    posterUrl: at("vault.webp"), mp4Url: at("vault.mp4"), webmUrl: at("vault.webm") },
  { id: "shadow", system: "shadow", title: "Shadow Run", durationSec: 46,
    description: "On live gold prices, each decision (long, short or flat) is locked above the empty slot before the next candle appears; the current champion trades beside it; results drop into a permanent record and an evidence meter crosses the promotion line.",
    posterUrl: at("shadow.webp"), mp4Url: at("shadow.mp4"), webmUrl: at("shadow.webm") },
  { id: "licensed", system: "licensed", title: "Licensed", durationSec: 41,
    description: "A strategy plaque is stamped with a gold licence seal; below it a live chart sags until a wick touches a red tripwire laser; the alarm fires, the seal is pulled and the plaque returns to the Shadow Run rack.",
    posterUrl: at("licensed.webp"), mp4Url: at("licensed.mp4"), webmUrl: at("licensed.webm") },
  { id: "mirror", system: "mirror", title: "Mirror", durationSec: 46,
    description: "Order tickets for EURUSD, AAPL and crude oil land slightly off their target price on a 3D price ladder; the misses build a histogram of real trading costs on a mirror, blended with the same-broker average, and the model beams into the Arena.",
    posterUrl: at("mirror.webp"), mp4Url: at("mirror.mp4"), webmUrl: at("mirror.webm") },
  { id: "forge", system: "forge", title: "The Forge", durationSec: 47,
    description: "Safe formula pieces snap into a tree that is tested inside a glass chamber; a red bar for the required score rises with every idea tried; columns for 109 ideas fall short — none accepted yet — and an empty slot waits for the first layer to earn its place.",
    posterUrl: at("forge.webp"), mp4Url: at("forge.mp4"), webmUrl: at("forge.webm") },
  { id: "hive", system: "hive", title: "Playbook, Hive and Fleet", durationSec: 43,
    description: "Licensed strategies shelve into calm, trending and volatile bays and seed new Arena runs; small orbs over a live S&P 500 chart are scored and merge into one Hive orb; three strategies balance on a platform that absorbs shocks.",
    posterUrl: at("hive.webp"), mp4Url: at("hive.mp4"), webmUrl: at("hive.webm") },
  { id: "proof", system: "proof", title: "Proof of Process", durationSec: 38,
    description: "Each decision becomes a block with a fingerprint, chained before its outcome appears; editing one breaks every later link; at midnight the day folds into a single seal; a Verify button checks every link in the viewer’s browser.",
    posterUrl: at("proof.webp"), mp4Url: at("proof.mp4"), webmUrl: at("proof.webm") },
  { id: "overview", system: "overview", title: "Overview", durationSec: 90, clickToPlay: true,
    description: "Highlights from every system in order, with title cards: Arena, Gauntlet, Vault Exam, Shadow Run, Licensed, Mirror, Forge, Playbook and Hive, and Proof of Process.",
    posterUrl: at("overview.webp"), mp4Url: at("overview.mp4") },
];

export const filmFor = (system: Film["system"]) => FILMS.find(f => f.system === system);
