// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Current Research Journal theme, for third-party widgets (TradingView) that
// take a theme name instead of CSS. They pick it up when they next load.
export const isDarkTheme = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
export const tvTheme = (): "dark" | "light" => (isDarkTheme() ? "dark" : "light");
export const tvGridColor = () => (isDarkTheme() ? "rgba(244, 239, 230, 0.06)" : "rgba(26, 26, 26, 0.06)");
export const tvBackground = () => (isDarkTheme() ? "rgba(26, 25, 22, 1)" : "rgba(255, 255, 255, 1)");
