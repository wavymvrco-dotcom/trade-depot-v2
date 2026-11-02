export const APP_VERSION = "2025.03.25.2";

export interface ChangeItem {
  icon: string;
  title: string;
  desc: string;
}

export const WHATS_NEW: ChangeItem[] = [
  {
    icon: "🎯",
    title: "App tour redesigned",
    desc: "The guided tour now follows every sidebar item in order, navigating live into each tab and showing what's there.",
  },
  {
    icon: "🔔",
    title: "Auto-update alerts",
    desc: "When a new version is deployed you'll see an update banner instantly — one click to refresh on any device.",
  },
  {
    icon: "🔒",
    title: "Security hardening",
    desc: "Broker credentials removed from server logs, TLS certificate validation enforced, email HTML content sanitized.",
  },
  {
    icon: "⚡",
    title: "Auto-trade broker warning",
    desc: "Amber AUTO badge and a persistent orange banner warn you when auto-trade is running without a live broker.",
  },
  {
    icon: "🤖",
    title: "Smarter onboarding",
    desc: "AI provider setup can now be skipped and configured later from Settings — no key required to get started.",
  },
  {
    icon: "📊",
    title: "OANDA quick link",
    desc: "Create a free OANDA account directly from the broker onboarding step with one click.",
  },
];
