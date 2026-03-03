import type { Theme } from "../themes.js";
import type { BorderResult } from "./types.js";

const TITLE_BAR_HEIGHT = 28;
const SIDE_PADDING = 12;
const CORNER_RADIUS = 8;
const SHADOW_PADDING = 16;

/** Traffic light button colors */
const TRAFFIC_LIGHTS = [
  { cx: 20, fill: "#ff5f56" },
  { cx: 40, fill: "#ffbd2e" },
  { cx: 60, fill: "#27c93f" },
];

/**
 * Darken a hex color by mixing it toward black.
 * Amount 0 = unchanged, 1 = fully black.
 */
function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

/** macOS-style window chrome with traffic lights, title bar, and drop shadow. */
export function macosBorder(
  innerWidth: number,
  innerHeight: number,
  theme: Theme,
  title?: string
): BorderResult {
  const outerWidth = innerWidth + SIDE_PADDING * 2;
  const outerHeight = innerHeight + TITLE_BAR_HEIGHT;

  // Total SVG dimensions include shadow bleed
  const width = outerWidth + SHADOW_PADDING * 2;
  const height = outerHeight + SHADOW_PADDING * 2;

  const titleBarBg = darken(theme.background, 0.15);
  const titleColor = theme.type === "dark" ? "#999999" : "#666666";

  const defs = `<defs>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.3"/>
  </filter>
</defs>`;

  const trafficLightsSvg = TRAFFIC_LIGHTS.map(
    (tl) => `  <circle cx="${tl.cx}" cy="14" r="6" fill="${tl.fill}"/>`
  ).join("\n");

  const titleSvg = title
    ? `  <text x="${outerWidth / 2}" y="18" fill="${titleColor}" font-size="12" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${title}</text>`
    : "";

  const beforeContent = `<g transform="translate(${SHADOW_PADDING}, ${SHADOW_PADDING})" filter="url(#shadow)">
  <rect width="${outerWidth}" height="${outerHeight}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="${theme.background}"/>
  <rect width="${outerWidth}" height="${TITLE_BAR_HEIGHT}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="${titleBarBg}"/>
  <rect y="${TITLE_BAR_HEIGHT - CORNER_RADIUS}" width="${outerWidth}" height="${CORNER_RADIUS}" fill="${titleBarBg}"/>
${trafficLightsSvg}
${titleSvg}`;

  const contentTransform = `translate(${SHADOW_PADDING + SIDE_PADDING}, ${SHADOW_PADDING + TITLE_BAR_HEIGHT})`;

  const afterContent = `</g>`;

  return { width, height, contentTransform, defs, beforeContent, afterContent };
}
