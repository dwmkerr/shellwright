#!/usr/bin/env node

import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as pty from "node-pty";
import * as fs from "fs/promises";
import * as path from "path";
import xterm from "@xterm/headless";
const { Terminal } = xterm;
import { bufferToSvg } from "./lib/buffer-to-svg.js";
import { bufferToAnsi, bufferToText } from "./lib/buffer-to-ansi.js";
import { Resvg, ResvgRenderOptions } from "@resvg/resvg-js";
import { renderGif } from "./lib/render-gif.js";

// Use system fonts for proper text rendering (resvg ignores them by default).
// Scale 2x for crisp output on retina displays.
const resvgOptions: ResvgRenderOptions = {
  font: { loadSystemFonts: true },
  fitTo: { mode: "zoom", value: 2 },
};
import { Command } from "commander";
import { getTheme, themes, DEFAULT_THEME, Theme } from "./lib/themes.js";

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_FAMILY = "Hack, Monaco, Courier, monospace";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;

const program = new Command();
program
  .name("shellwright")
  .description("MCP server for terminal automation, screenshots, and video recording")
  .option("-p, --port <number>", "Server port", process.env.PORT || "7498")
  .option("-t, --theme <name>", "Color theme for screenshots/recordings", process.env.THEME || DEFAULT_THEME)
  .option("--temp-dir <path>", "Directory for recording frames", process.env.TEMP_DIR || "/tmp/shellwright")
  .option("--font-size <number>", "Font size in pixels for screenshots/recordings", process.env.FONT_SIZE || String(DEFAULT_FONT_SIZE))
  .option("--font-family <name>", "Font family for screenshots/recordings", process.env.FONT_FAMILY || DEFAULT_FONT_FAMILY)
  .option("--cols <number>", "Default terminal columns", String(DEFAULT_COLS))
  .option("--rows <number>", "Default terminal rows", String(DEFAULT_ROWS))
  .option("-b, --background", "Run in background mode")
  .parse();

const opts = program.opts();

const PORT = parseInt(opts.port, 10);
const TEMP_DIR = opts.tempDir;
const BACKGROUND = opts.background;
const FONT_SIZE = parseInt(opts.fontSize, 10);
const FONT_FAMILY = opts.fontFamily;
const COLS = parseInt(opts.cols, 10);
const ROWS = parseInt(opts.rows, 10);

let currentTheme: Theme;
try {
  currentTheme = getTheme(opts.theme);
  console.log(`[shellwright] Theme: ${currentTheme.name}`);
  console.log(`[shellwright] Font: ${FONT_FAMILY} @ ${FONT_SIZE}px`);
  console.log(`[shellwright] Terminal: ${COLS}x${ROWS}`);
  console.log(`[shellwright] Temp directory: ${TEMP_DIR}`);
} catch (err) {
  console.error(`[shellwright] ${(err as Error).message}`);
  console.error(`[shellwright] Available themes: ${Object.keys(themes).join(", ")}`);
  process.exit(1);
}

// Build a clean env for PTY sessions - removes vars that could cause terminal interference
function getPtyEnv(): { [key: string]: string } {
  const env = { ...process.env } as { [key: string]: string };
  // Remove terminal-related vars that could cause the PTY to interact with parent terminal
  delete env.TERM_PROGRAM;
  delete env.TERM_PROGRAM_VERSION;
  delete env.TERM_SESSION_ID;
  delete env.ITERM_SESSION_ID;
  delete env.ITERM_PROFILE;
  delete env.TMUX;
  delete env.TMUX_PANE;
  delete env.STY;  // screen
  delete env.WINDOW;
  // Set terminal type and color support
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return env;
}

// Interpret escape sequences in input strings (e.g., \r → carriage return)
function interpretEscapes(str: string): string {
  return str
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\x1b/g, "\x1b")
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Basic ANSI stripping (incomplete - see 04-findings.md for why this is insufficient)
function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")  // CSI sequences
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")  // OSC sequences
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, "")  // DCS/SOS/PM/APC
    .replace(/\x1b[\(\)][AB0-2]/g, "")  // Character set selection
    .replace(/\x1b[=>NOM78]/g, "")  // Other escape sequences
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");  // Control chars
}

interface RecordingState {
  startTime: number;
  framesDir: string;
  frameCount: number;
  interval: ReturnType<typeof setInterval>;
  fps: number;
}

interface Session {
  id: string;
  pty: pty.IPty;
  cols: number;
  rows: number;
  buffer: string[];
  terminal: InstanceType<typeof Terminal>;
  recording?: RecordingState;
}

const sessions = new Map<string, Session>();
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Build temp path: /tmp/shellwright/mcp-session-{mcpId}/{shellId}
function getSessionDir(mcpSessionId: string | undefined, shellSessionId: string): string {
  const mcpPart = mcpSessionId ? `mcp-session-${mcpSessionId}` : "mcp-session-unknown";
  return path.join(TEMP_DIR, mcpPart, shellSessionId);
}

const createServer = (transport: StreamableHTTPServerTransport) => {
  const server = new McpServer({
    name: "shellwright",
    version: "0.1.0",
  });

  server.tool(
    "shell_start",
    "Start a new PTY session with a command",
    {
      command: z.string().describe("Command to run (e.g., 'k9s', 'bash')"),
      args: z.array(z.string()).optional().describe("Command arguments"),
      cols: z.number().optional().describe(`Terminal columns (default: ${COLS})`),
      rows: z.number().optional().describe(`Terminal rows (default: ${ROWS})`),
    },
    async ({ command, args, cols, rows }) => {
      const id = `shell-session-${randomUUID().slice(0, 6)}`;
      const termCols = cols || COLS;
      const termRows = rows || ROWS;

      const ptyProcess = pty.spawn(command, args || [], {
        name: "xterm-256color",
        cols: termCols,
        rows: termRows,
        cwd: process.cwd(),
        env: getPtyEnv(),
      });

      const terminal = new Terminal({
        cols: termCols,
        rows: termRows,
        allowProposedApi: true,
      });

      const session: Session = {
        id,
        pty: ptyProcess,
        cols: termCols,
        rows: termRows,
        buffer: [],
        terminal,
      };

      ptyProcess.onData((data) => {
        session.buffer.push(data);
        if (session.buffer.length > 1000) {
          session.buffer.shift();
        }
        terminal.write(data);
      });

      sessions.set(id, session);
      console.log(`[shellwright] Started session ${id}: ${command}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ shell_session_id: id }) }],
      };
    }
  );

  server.tool(
    "shell_send",
    "Send input to a PTY session",
    {
      session_id: z.string().describe("Session ID"),
      input: z.string().describe("Input to send (supports escape sequences like \\x1b[A for arrow up)"),
      delay_ms: z.number().optional().describe("Delay after sending in ms (default: 100)"),
    },
    async ({ session_id, input, delay_ms }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      const interpreted = interpretEscapes(input);
      session.pty.write(interpreted);
      console.log(`[shellwright] Sent to ${session_id}: ${JSON.stringify(input)}`);

      await new Promise((resolve) => setTimeout(resolve, delay_ms || 100));

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
      };
    }
  );

  server.tool(
    "shell_read",
    "Read the current terminal buffer (basic ANSI stripping - see findings for limitations)",
    {
      session_id: z.string().describe("Session ID"),
      raw: z.boolean().optional().describe("Return raw ANSI codes (default: false)"),
    },
    async ({ session_id, raw }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      let content = session.buffer.join("");
      if (!raw) {
        content = stripAnsi(content);
      }

      // Limit to last 8KB to avoid context overflow
      const maxSize = 8192;
      if (content.length > maxSize) {
        content = "...(truncated)...\n" + content.slice(-maxSize);
      }

      console.log(`[shellwright] Read ${content.length} chars from ${session_id}`);

      return {
        content: [{ type: "text" as const, text: content }],
      };
    }
  );

  server.tool(
    "shell_screenshot",
    "Capture terminal screenshot as PNG, ANSI, and plain text",
    {
      session_id: z.string().describe("Session ID"),
      name: z.string().optional().describe("Screenshot name (default: screenshot_{timestamp})"),
    },
    async ({ session_id, name }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      const baseName = name || `screenshot_${Date.now()}`;
      const sessionDir = getSessionDir(transport.sessionId, session_id);
      const screenshotDir = path.join(sessionDir, "screenshots");

      await fs.mkdir(screenshotDir, { recursive: true });

      // Generate all formats from xterm buffer
      const svg = bufferToSvg(session.terminal, session.cols, session.rows, { theme: currentTheme, fontSize: FONT_SIZE, fontFamily: FONT_FAMILY });
      const png = new Resvg(svg, resvgOptions).render().asPng();
      const ansi = bufferToAnsi(session.terminal, session.cols, session.rows, { theme: currentTheme });
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

      console.log(`[shellwright] Screenshot saved: ${baseName}.{png,svg,ansi,txt}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          filename: `${baseName}.png`,
          mimetype: "image/png",
          base64: png.toString("base64"),
        }) }],
      };
    }
  );

  server.tool(
    "shell_stop",
    "Stop a PTY session",
    {
      session_id: z.string().describe("Session ID"),
    },
    async ({ session_id }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      // Stop recording if active
      if (session.recording) {
        clearInterval(session.recording.interval);
      }

      session.pty.kill();
      sessions.delete(session_id);
      console.log(`[shellwright] Stopped session ${session_id}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
      };
    }
  );

  server.tool(
    "shell_record_start",
    "Start recording a terminal session (captures frames for GIF/video export)",
    {
      session_id: z.string().describe("Session ID"),
      fps: z.number().optional().describe("Frames per second (default: 10, max: 30)"),
    },
    async ({ session_id, fps }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      if (session.recording) {
        throw new Error(`Session ${session_id} is already recording`);
      }

      const recordingFps = Math.min(fps || 10, 30);
      const sessionDir = getSessionDir(transport.sessionId, session_id);
      const framesDir = path.join(sessionDir, "frames");
      await fs.mkdir(framesDir, { recursive: true });

      session.recording = {
        startTime: Date.now(),
        framesDir,
        frameCount: 0,
        fps: recordingFps,
        interval: setInterval(async () => {
          if (!session.recording) return;

          const frameNum = session.recording.frameCount++;
          const svg = bufferToSvg(session.terminal, session.cols, session.rows, { theme: currentTheme, fontSize: FONT_SIZE, fontFamily: FONT_FAMILY });
          const png = new Resvg(svg, resvgOptions).render().asPng();
          const framePath = path.join(framesDir, `frame${String(frameNum).padStart(6, "0")}.png`);
          await fs.writeFile(framePath, png);
        }, 1000 / recordingFps),
      };

      console.log(`[shellwright] Recording started: ${session_id} @ ${recordingFps} FPS → ${framesDir}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          recording: true,
          fps: recordingFps,
          frames_dir: framesDir,
        }) }],
      };
    }
  );

  server.tool(
    "shell_record_stop",
    "Stop recording and return GIF as base64 (video export coming soon)",
    {
      session_id: z.string().describe("Session ID"),
      name: z.string().optional().describe("Recording name (default: recording_{timestamp})"),
    },
    async ({ session_id, name }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      if (!session.recording) {
        throw new Error(`Session ${session_id} is not recording`);
      }

      clearInterval(session.recording.interval);
      const { framesDir, frameCount, fps, startTime } = session.recording;
      const durationMs = Date.now() - startTime;

      const filename = `${name || `recording_${Date.now()}`}.gif`;
      const sessionDir = getSessionDir(transport.sessionId, session_id);
      const recordingsDir = path.join(sessionDir, "recordings");
      const filePath = path.join(recordingsDir, filename);

      await fs.mkdir(recordingsDir, { recursive: true });

      // Render GIF
      await renderGif(framesDir, filePath, { fps });

      // Read GIF data
      const gifData = await fs.readFile(filePath);

      // Cleanup frames (keep the GIF for diagnostics)
      await fs.rm(framesDir, { recursive: true, force: true });
      session.recording = undefined;

      console.log(`[shellwright] Recording saved: ${filePath} (${frameCount} frames, ${durationMs}ms)`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          filename,
          mimetype: "image/gif",
          base64: gifData.toString("base64"),
          frame_count: frameCount,
          duration_ms: durationMs,
        }) }],
      };
    }
  );

  return server;
};

const app = express();
app.use(express.json());

app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  console.log(`[shellwright] POST /mcp ${sessionId ? `session=${sessionId}` : "new"}`);

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      console.log(`[shellwright] New session initializing`);
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          console.log(`[shellwright] Session initialized: ${sid}`);
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`[shellwright] Session closed: ${sid}`);
          delete transports[sid];
        }
      };

      const server = createServer(transport);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[shellwright] Error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  console.log(`[shellwright] GET /mcp session=${sessionId}`);

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  console.log(`[shellwright] DELETE /mcp session=${sessionId}`);

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`[shellwright] MCP server running at http://localhost:${PORT}/mcp`);
});

process.on("SIGINT", async () => {
  console.log("[shellwright] Shutting down...");
  for (const sessionId in transports) {
    await transports[sessionId].close();
  }
  process.exit(0);
});
