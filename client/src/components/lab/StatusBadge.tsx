// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Research Journal status badge. Status is never shown by color alone: the
// label is always the text.

export type Status = "licensed" | "passed" | "probation" | "shadow" | "arena" | "rejected" | "scrapped" | "live";

const STYLE: Record<Status, { bg: string; fg: string; label: string }> = {
  licensed:  { bg: "var(--rj-licensed-bg)", fg: "var(--rj-licensed-fg)", label: "Licensed" },
  live:      { bg: "var(--rj-licensed-bg)", fg: "var(--rj-licensed-fg)", label: "Live" },
  passed:    { bg: "var(--rj-passed-bg)",   fg: "var(--rj-passed-fg)",   label: "Passed" },
  probation: { bg: "var(--rj-shadow-bg)",   fg: "var(--rj-shadow-fg)",   label: "Probation" },
  shadow:    { bg: "var(--rj-shadow-bg)",   fg: "var(--rj-shadow-fg)",   label: "Shadow" },
  arena:     { bg: "var(--rj-arena-bg)",    fg: "var(--rj-arena-fg)",    label: "Arena" },
  rejected:  { bg: "var(--rj-rejected-bg)", fg: "var(--rj-rejected-fg)", label: "Rejected" },
  scrapped:  { bg: "var(--rj-rejected-bg)", fg: "var(--rj-rejected-fg)", label: "Scrapped" },
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const s = STYLE[status];
  return (
    <span className="inline-block w-fit px-[9px] py-[3px] rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}>
      {label ?? s.label}
    </span>
  );
}
