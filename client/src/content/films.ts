// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Film registry (build sheet §17.3). New films drop in by filling the URLs here;
// no code changes. Files live in object storage behind a CDN, never in git or
// the app bundle. A missing film falls back to its poster, then to a labeled
// placeholder frame. Honesty rule: films show process, never profits or P&L.

export interface Film {
  id: string;
  system: "arena" | "gauntlet" | "vault" | "shadow" | "licensed" | "overview";
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
  { id: "arena", system: "arena", title: "Arena", durationSec: 20,
    description: "Glowing agents race across terrain made of price charts; the weak fade to grey.",
    posterUrl: at("arena.webp"), mp4Url: at("arena.mp4"), webmUrl: at("arena.webm") },
  { id: "gauntlet", system: "gauntlet", title: "Gauntlet", durationSec: 20,
    description: "A strategy crosses a corridor of hazards while a hunter drone strikes at its stop; a storm front rolls in.",
    posterUrl: at("gauntlet.webp"), mp4Url: at("gauntlet.mp4"), webmUrl: at("gauntlet.webm") },
  { id: "vault", system: "vault", title: "Vault Exam", durationSec: 20,
    description: "A vault door opens once, one strategy enters, and the door seals behind it.",
    posterUrl: at("vault.webp"), mp4Url: at("vault.mp4"), webmUrl: at("vault.webm") },
  { id: "shadow", system: "shadow", title: "Shadow Run", durationSec: 20,
    description: "A translucent twin of the strategy trades beside a live chart, mirroring every decision.",
    posterUrl: at("shadow.webp"), mp4Url: at("shadow.mp4"), webmUrl: at("shadow.webm") },
  { id: "licensed", system: "licensed", title: "Licensed", durationSec: 20,
    description: "A gold seal is stamped onto a strategy card and a timestamp locks into a chain.",
    posterUrl: at("licensed.webp"), mp4Url: at("licensed.mp4"), webmUrl: at("licensed.webm") },
  { id: "overview", system: "overview", title: "Overview", durationSec: 90, clickToPlay: true,
    description: "All five systems in sequence: Arena, Gauntlet, Vault Exam, Shadow Run and Licensed.",
    posterUrl: at("overview.webp"), mp4Url: at("overview.mp4") },
];

export const filmFor = (system: Film["system"]) => FILMS.find(f => f.system === system);
