/**
 * Generate SVG from xterm.js buffer with colors
 *
 * Extracts styled content directly from the terminal buffer,
 * preserving colors for accurate terminal rendering.
 */

import type { Terminal } from "@xterm/headless";
import { Theme, oneDark } from "./themes.js";

/**
 * Build the 256-color palette using theme colors for indices 0-15
 * and standard colors for 16-255.
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
        colors.push(`#${ri.toString(16).padStart(2, "0")}${gi.toString(16).padStart(2, "0")}${bi.toString(16).padStart(2, "0")}`);
      }
    }
  }

  // Generate grayscale (232-255)
  for (let i = 0; i < 24; i++) {
    const v = i * 10 + 8;
    colors.push(`#${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}`);
  }

  return colors;
}

interface SvgOptions {
  fontSize?: number;
  fontFamily?: string;
  theme?: Theme;
}

const DEFAULT_OPTIONS = {
  fontSize: 14,
  fontFamily: "Hack, Monaco, Courier, monospace",
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function colorToHex(colorCode: number, palette: string[], defaultColor: string): string {
  // xterm getFgColor/getBgColor returns:
  //   -1 for default (no explicit color)
  //   0-255 for palette colors (0=black, 1=red, 2=green, etc.)
  //   >255 for RGB colors (raw RGB value)
  if (colorCode < 0) {
    return defaultColor;
  }
  if (colorCode >= 0 && colorCode <= 255) {
    return palette[colorCode] || defaultColor;
  }
  // RGB color - xterm.js returns raw RGB values > 255
  if (colorCode > 255) {
    return `#${colorCode.toString(16).padStart(6, "0")}`;
  }
  return defaultColor;
}

export function bufferToSvg(
  terminal: InstanceType<typeof Terminal>,
  cols: number,
  rows: number,
  options: SvgOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const theme = opts.theme || oneDark;
  const palette = buildPalette(theme);

  const charWidth = opts.fontSize * 0.6;
  const lineHeight = opts.fontSize * 1.2;
  const padding = 10;

  const width = cols * charWidth + padding * 2;
  const height = rows * lineHeight + padding * 2;

  const buffer = terminal.buffer.active;
  const lines: string[] = [];

  for (let y = 0; y < rows; y++) {
    const line = buffer.getLine(y);
    if (!line) continue;

    let x = 0;
    while (x < cols) {
      const cell = line.getCell(x);
      if (!cell) {
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

      const fgCode = cell.getFgColor();
      const bgCode = cell.getBgColor();
      const isBold = cell.isBold();
      const isItalic = cell.isItalic();
      const isUnderline = cell.isUnderline();
      const isInverse = cell.isInverse();

      let fg = colorToHex(fgCode, palette, theme.foreground);
      let bg = colorToHex(bgCode, palette, theme.background);

      // Handle inverse/reverse video - swap fg and bg
      if (isInverse) {
        [fg, bg] = [bg, fg];
      }

      const xPos = padding + x * charWidth;
      const yPos = padding + y * lineHeight + opts.fontSize;

      // Background rect if not default
      if (bg && bg !== theme.background) {
        lines.push(
          `<rect x="${xPos}" y="${yPos - opts.fontSize}" width="${charWidth * cellWidth}" height="${lineHeight}" fill="${bg}"/>`
        );
      }

      // Text element
      const styles: string[] = [];
      if (fg !== theme.foreground) styles.push(`fill="${fg}"`);
      if (isBold) styles.push('font-weight="bold"');
      if (isItalic) styles.push('font-style="italic"');
      if (isUnderline) styles.push('text-decoration="underline"');

      const styleAttr = styles.length > 0 ? " " + styles.join(" ") : "";
      const escapedChar = escapeXml(char);

      if (escapedChar.trim() || bg) {
        lines.push(`<text x="${xPos}" y="${yPos}"${styleAttr}>${escapedChar || " "}</text>`);
      }

      x += cellWidth;
    }
  }

  // Render cursor if visible
  if ((terminal.modes as { showCursor?: boolean }).showCursor) {
    const cursorX = buffer.cursorX;
    const cursorY = buffer.cursorY;

    // Only render if cursor is within visible area
    if (cursorX >= 0 && cursorX < cols && cursorY >= 0 && cursorY < rows) {
      const cursorXPos = padding + cursorX * charWidth;
      const cursorYPos = padding + cursorY * lineHeight;

      // Get the cell at cursor position for color inversion
      const cursorLine = buffer.getLine(cursorY);
      const cursorCell = cursorLine?.getCell(cursorX);

      // Cursor block uses foreground color
      const cursorBg = theme.foreground;
      // Text under cursor uses background color (inversion)
      const cursorFg = theme.background;

      // Draw cursor block
      lines.push(
        `<rect x="${cursorXPos}" y="${cursorYPos}" width="${charWidth}" height="${lineHeight}" fill="${cursorBg}"/>`
      );

      // Draw inverted character if present
      if (cursorCell) {
        const char = cursorCell.getChars();
        if (char && char.trim()) {
          const textYPos = cursorYPos + opts.fontSize;
          lines.push(
            `<text x="${cursorXPos}" y="${textYPos}" fill="${cursorFg}">${escapeXml(char)}</text>`
          );
        }
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="${opts.fontFamily}" font-size="${opts.fontSize}">
<rect width="100%" height="100%" fill="${theme.background}"/>
<g fill="${theme.foreground}">
${lines.join("\n")}
</g>
</svg>`;
}
