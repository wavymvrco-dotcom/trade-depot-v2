// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Plays a system film (§17.3): muted, inline, looped; loads nothing until needed;
// autoplays only while on screen, never with reduced motion (poster + Play
// button instead), pauses when the tab is hidden. Falls back to the poster, then
// to a labeled placeholder frame when the film is missing or fails to load.

import { useEffect, useRef, useState } from "react";
import type { Film } from "@/content/films";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function FilmPlayer({ film, code, className = "" }: { film?: Film; code: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const reduced = prefersReducedMotion();
  const hasVideo = !!film && !!(film.mp4Url || film.webmUrl) && !failed;
  const auto = hasVideo && !reduced && !film!.clickToPlay;

  useEffect(() => { setFailed(false); setPosterFailed(false); setPlaying(false); }, [film?.id]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !auto) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && document.visibilityState === "visible") v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.4 });
    io.observe(v);
    const onVis = () => { if (document.visibilityState !== "visible") v.pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [auto, film?.id]);

  const play = () => { ref.current?.play().then(() => setPlaying(true)).catch(() => setFailed(true)); };

  const frame = `relative overflow-hidden rounded-xl bg-film text-film-text ${className}`;

  if (!hasVideo) {
    return (
      <figure className={frame} aria-label={film?.description ?? "Film coming soon"}>
        {film?.posterUrl && !posterFailed ? (
          <img src={film.posterUrl} alt={film.description} onError={() => setPosterFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col justify-between p-5 md:p-6">
            <span className="font-mono text-[11px] md:text-xs tracking-[0.08em]">3D FILM PLACEHOLDER · {code}</span>
            <span className="font-mono text-xs md:text-sm leading-relaxed text-center max-w-md self-center">[{film?.description ?? "Film coming soon"}]</span>
            <span className="font-mono text-[11px] md:text-xs">{film ? `0:${String(film.durationSec).padStart(2, "0")} LOOP` : ""}</span>
          </div>
        )}
      </figure>
    );
  }

  return (
    <figure className={frame}>
      <video
        ref={ref}
        className="w-full h-full object-cover"
        muted playsInline loop={!film!.clickToPlay} preload="none"
        poster={film!.posterUrl}
        aria-label={film!.description}
        onError={() => setFailed(true)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        {film!.webmUrl && <source src={film!.webmUrl} type="video/webm" onError={() => {}} />}
        {film!.mp4Url && <source src={film!.mp4Url} type="video/mp4" onError={() => setFailed(true)} />}
        {film!.captionsUrl && <track kind="captions" src={film!.captionsUrl} srcLang="en" label="English" />}
      </video>
      <figcaption className="sr-only">{film!.description}</figcaption>
      {!auto && !playing && (
        <button type="button" onClick={play} aria-label={`Play the ${film!.title} film`}
          className="absolute inset-0 m-auto w-[68px] h-[68px] rounded-full border border-paper flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </button>
      )}
    </figure>
  );
}
