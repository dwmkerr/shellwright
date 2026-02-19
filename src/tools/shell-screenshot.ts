import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { Resvg } from "@resvg/resvg-js";
import { bufferToSvg } from "../lib/buffer-to-svg.js";
import { bufferToAnsi, bufferToText } from "../lib/buffer-to-ansi.js";
import { ToolContext } from "./types.js";

export const shellScreenshotSchema = {
  session_id: z.string().describe("Session ID"),
  name: z.string().optional().describe("Screenshot name (default: screenshot_{timestamp})"),
};

export async function shellScreenshot(
  params: { session_id: string; name?: string },
  context: ToolContext
) {
  const { session_id, name } = params;
  const session = context.sessions.get(session_id);
  if (!session) {
    throw new Error(`Session not found: ${session_id}`);
  }

  const baseName = name || `screenshot_${Date.now()}`;
  const filename = `${baseName}.png`;
  const sessionDir = context.getSessionDir(context.getMcpSessionId(), session_id);
  const screenshotDir = path.join(sessionDir, "screenshots");

  await fs.mkdir(screenshotDir, { recursive: true });

  // Generate all formats from xterm buffer
  const svg = bufferToSvg(session.terminal, session.cols, session.rows, { 
    theme: session.theme, 
    fontSize: context.config.FONT_SIZE, 
    fontFamily: context.config.FONT_FAMILY 
  });
  const png = new Resvg(svg, context.resvgOptions).render().asPng();
  const ansi = bufferToAnsi(session.terminal, session.cols, session.rows, { theme: session.theme });
  const text = bufferToText(session.terminal, session.cols, session.rows);

  // Save all formats
  const pngPath = path.join(screenshotDir, `${baseName}.png`);
  const svgPath = path.join(screenshotDir, `${baseName}.svg`);
  const ansiPath = path.join(screenshotDir, `${baseName}.ansi`);
  const textPath = path.join(screenshotDir, `${baseName}.txt`);

  await Promise.all([
    fs.writeFile(pngPath, png),
    fs.writeFile(svgPath, svg),
    fs.writeFile(ansiPath, ansi),
    fs.writeFile(textPath, text),
  ]);

  context.log(`[shellwright] Screenshot saved: ${screenshotDir}/${baseName}.{png,svg,ansi,txt}`);

  const mcpSessionId = context.getMcpSessionId();
  const pngUrl = context.getDownloadUrl(mcpSessionId, session_id, "screenshots", `${baseName}.png`);
  const svgUrl = context.getDownloadUrl(mcpSessionId, session_id, "screenshots", `${baseName}.svg`);
  const output = {
    filename,
    download_url: pngUrl,
    png_url: pngUrl,
    svg_url: svgUrl,
    hint: "Use curl -o <filename> <download_url> to save the file",
  };
  context.logToolCall("shell_screenshot", { session_id, name }, output);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}
