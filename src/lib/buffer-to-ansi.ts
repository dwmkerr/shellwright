/**
 * Generate ANSI-colored text from xterm.js buffer
 *
 * Reconstructs ANSI escape sequences from the terminal buffer,
 * using theme colors for defaults so output matches SVG/PNG rendering.
 */

import type { Terminal } from "@xterm/headless";
import { Theme, oneDark } from "./themes.js";

const ESC = "\x1b";
const RESET = `${ESC}[0m`;

interface ResolvedColor {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): ResolvedColor {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function colorsEqual(a: ResolvedColor, b: ResolvedColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

interface AnsiState {
  fg: ResolvedColor;
  bg: ResolvedColor;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

function statesEqual(a: AnsiState, b: AnsiState): boolean {
  return (
    colorsEqual(a.fg, b.fg) &&
    colorsEqual(a.bg, b.bg) &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline
  );
}

/**
 * Resolve xterm.js color code to RGB using theme and palette
 */
function resolveColor(
  colorCode: number,
  palette: string[],
  defaultColor: string
): ResolvedColor {
  if (colorCode <= 0) {
    return hexToRgb(defaultColor);
  }
  if (colorCode >= 1 && colorCode <= 256) {
    return hexToRgb(palette[colorCode - 1] || defaultColor);
  }
  // RGB color - xterm.js returns raw RGB values > 256
  if (colorCode > 256) {
    return {
      r: (colorCode >> 16) & 0xff,
      g: (colorCode >> 8) & 0xff,
      b: colorCode & 0xff,
    };
  }
  return hexToRgb(defaultColor);
}

/**
 * Build the 256-color palette using theme colors for indices 0-15
 */
function buildPalette(theme: Theme): string[] {
  const colors: string[] = [...theme.ansiColors];

  // Generate 216 color cube (16-231)
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        const ri = r ? r * 40 + 55 : 0;
        const gi = g ? g * 40 + 55 : 0;
        const bi = b ? b * 40 + 55 : 0;
        colors.push(
          `#${ri.toString(16).padStart(2, "0")}${gi.toString(16).padStart(2, "0")}${bi.toString(16).padStart(2, "0")}`
        );
      }
    }
  }

  // Generate grayscale (232-255)
  for (let i = 0; i < 24; i++) {
    const v = i * 10 + 8;
    colors.push(
      `#${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}`
    );
  }

  return colors;
}

function buildAnsiSequence(
  state: AnsiState,
  defaultFg: ResolvedColor,
  defaultBg: ResolvedColor
): string {
  const codes: string[] = [];

  if (state.bold) codes.push("1");
  if (state.italic) codes.push("3");
  if (state.underline) codes.push("4");

  // Always emit foreground color as RGB
  codes.push(`38;2;${state.fg.r};${state.fg.g};${state.fg.b}`);

  // Only emit background if not the default background
  if (!colorsEqual(state.bg, defaultBg)) {
    codes.push(`48;2;${state.bg.r};${state.bg.g};${state.bg.b}`);
  }

  return `${ESC}[${codes.join(";")}m`;
}

interface AnsiOptions {
  theme?: Theme;
}

export function bufferToAnsi(
  terminal: InstanceType<typeof Terminal>,
  cols: number,
  rows: number,
  options: AnsiOptions = {}
): string {
  const theme = options.theme || oneDark;
  const palette = buildPalette(theme);
  const defaultFg = hexToRgb(theme.foreground);
  const defaultBg = hexToRgb(theme.background);

  const buffer = terminal.buffer.active;
  const lines: string[] = [];

  for (let y = 0; y < rows; y++) {
    const line = buffer.getLine(y);
    if (!line) {
      lines.push("");
      continue;
    }

    let lineStr = "";
    let currentState: AnsiState | null = null;
    let x = 0;

    while (x < cols) {
      const cell = line.getCell(x);
      if (!cell) {
        lineStr += " ";
        x++;
        continue;
      }

      const char = cell.getChars() || " ";
      const cellWidth = cell.getWidth() || 1;

      // Skip continuation cells (wide chars)
      if (cellWidth === 0) {
        x++;
        continue;
      }

      let fg = resolveColor(cell.getFgColor(), palette, theme.foreground);
      let bg = resolveColor(cell.getBgColor(), palette, theme.background);

      // Handle inverse/reverse video - swap fg and bg
      if (cell.isInverse()) {
        [fg, bg] = [bg, fg];
      }

      const newState: AnsiState = {
        fg,
        bg,
        bold: !!cell.isBold(),
        italic: !!cell.isItalic(),
        underline: !!cell.isUnderline(),
      };

      // Emit ANSI codes if state changed
      if (!currentState || !statesEqual(currentState, newState)) {
        lineStr += RESET + buildAnsiSequence(newState, defaultFg, defaultBg);
        currentState = newState;
      }

      lineStr += char;
      x += cellWidth;
    }

    // Reset at end of line
    lineStr += RESET;

    // Trim trailing spaces but preserve the line
    lines.push(lineStr.trimEnd());
  }

  return lines.join("\n");
}

export function bufferToText(
  terminal: InstanceType<typeof Terminal>,
  cols: number,
  rows: number
): string {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];

  for (let y = 0; y < rows; y++) {
    const line = buffer.getLine(y);
    if (!line) {
      lines.push("");
      continue;
    }

    lines.push(line.translateToString(true).trimEnd());
  }

  return lines.join("\n");
}
