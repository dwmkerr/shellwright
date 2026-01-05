/**
 * Generate theme screenshots for documentation
 *
 * Run with: npx tsx scripts/generate-theme-screenshots.ts
 */

import xterm from "@xterm/headless";
import * as fs from "fs";
import * as path from "path";
import { bufferToSvg } from "../src/lib/buffer-to-svg.js";
import { themes } from "../src/lib/themes.js";

const COLS = 50;
const ROWS = 8;
const OUTPUT_DIR = path.join(import.meta.dirname, "../docs/themes");

// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";
const BRIGHT_BLACK = "\x1b[90m";

async function generateScreenshots() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const [themeName, theme] of Object.entries(themes)) {
    console.log(`Generating ${themeName}...`);

    // Create a fresh terminal for each theme
    const terminal = new xterm.Terminal({
      cols: COLS,
      rows: ROWS,
      allowProposedApi: true,
    });

    // Write colorful content demonstrating the theme
    // Simulates a git-style colored prompt and ls output
    terminal.write(`${GREEN}~/projects/shellwright${RESET} ${CYAN}main${RESET} ${YELLOW}✓${RESET}\r\n`);
    terminal.write(`${BOLD}${WHITE}$ ${RESET}ls -la\r\n`);
    terminal.write(`${BLUE}drwxr-xr-x${RESET}  ${GREEN}src${RESET}/\r\n`);
    terminal.write(`${BLUE}drwxr-xr-x${RESET}  ${GREEN}docs${RESET}/\r\n`);
    terminal.write(`-rw-r--r--  ${WHITE}README.md${RESET}\r\n`);
    terminal.write(`-rw-r--r--  ${YELLOW}package.json${RESET}\r\n`);
    terminal.write(`${BRIGHT_BLACK}4 items${RESET}\r\n`);

    // Wait for terminal to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Generate SVG with this theme
    const svg = bufferToSvg(terminal, COLS, ROWS, {
      theme,
      fontSize: 14,
      fontFamily: "Hack, Monaco, Courier, monospace",
    });

    // Save SVG only (cleaner than PNG for docs)
    const basePath = path.join(OUTPUT_DIR, themeName);
    fs.writeFileSync(`${basePath}.svg`, svg);

    console.log(`  -> ${themeName}.svg`);

    terminal.dispose();
  }

  console.log("\nDone! Screenshots saved to docs/themes/");
}

generateScreenshots().catch(console.error);
