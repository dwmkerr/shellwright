/**
 * Generate theme screenshots for documentation
 *
 * Run with: npx tsx scripts/generate-theme-screenshots.ts
 */

import xterm from "@xterm/headless";
import { Resvg } from "@resvg/resvg-js";
import * as fs from "fs";
import * as path from "path";
import { bufferToSvg } from "../src/lib/buffer-to-svg.js";
import { themes } from "../src/lib/themes.js";

const COLS = 60;
const ROWS = 6;
const OUTPUT_DIR = path.join(import.meta.dirname, "../docs/themes");

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

    // Write content that looks like a shell session
    terminal.write("$ echo \"Hello Shellwright\"\r\n");
    terminal.write("Hello Shellwright\r\n");
    terminal.write("$ ");

    // Wait for terminal to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Generate SVG with this theme
    const svg = bufferToSvg(terminal, COLS, ROWS, {
      theme,
      fontSize: 14,
      fontFamily: "Hack, Monaco, Courier, monospace",
    });

    // Convert SVG to PNG
    const resvg = new Resvg(svg, {
      font: { loadSystemFonts: true },
      fitTo: { mode: "original" },
    });
    const png = resvg.render().asPng();

    // Save files
    const basePath = path.join(OUTPUT_DIR, themeName);
    fs.writeFileSync(`${basePath}.svg`, svg);
    fs.writeFileSync(`${basePath}.png`, png);

    console.log(`  -> ${themeName}.png`);

    terminal.dispose();
  }

  console.log("\nDone! Screenshots saved to docs/themes/");
}

generateScreenshots().catch(console.error);
