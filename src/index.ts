#!/usr/bin/env node

import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as pty from "node-pty";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import xterm from "@xterm/headless";
const { Terminal } = xterm;
import { bufferToSvg } from "./lib/buffer-to-svg.js";
import { bufferToAnsi, bufferToText } from "./lib/buffer-to-ansi.js";
import { Resvg, ResvgRenderOptions } from "@resvg/resvg-js";
import { renderGif } from "./lib/render-gif.js";
import { registerPrompts } from "./prompts.js";

// Use system fonts for proper text rendering (resvg ignores them by default).
// Scale 2x for crisp output on retina displays.
const resvgOptions: ResvgRenderOptions = {
  font: { loadSystemFonts: true },
  fitTo: { mode: "zoom", value: 2 },
};
import { Command } from "commander";
import { getTheme, themes, DEFAULT_THEME, Theme, getThemesByType } from "./lib/themes.js";

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
  .option("--http", "Use HTTP transport instead of stdio (default: stdio)")
  .option("--log-path <path>", "Log tool calls to JSONL file (one JSON object per line)")
  .parse();

const opts = program.opts();

const PORT = parseInt(opts.port, 10);
const TEMP_DIR = opts.tempDir;
const USE_HTTP = opts.http;
const FONT_SIZE = parseInt(opts.fontSize, 10);
const FONT_FAMILY = opts.fontFamily;
const COLS = parseInt(opts.cols, 10);
const ROWS = parseInt(opts.rows, 10);
const LOG_PATH = opts.logPath as string | undefined;

// Log tool calls to JSONL file for debugging
function logToolCall(tool: string, input: Record<string, unknown>, output: Record<string, unknown>): void {
  if (!LOG_PATH) return;
  const entry = { ts: new Date().toISOString(), tool, input, output };
  fsSync.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
}

// Log to stderr in stdio mode (stdout is reserved for MCP protocol)
function log(message: string): void {
  if (USE_HTTP) {
    console.log(message);
  } else {
    console.error(message);
  }
}

let currentTheme: Theme;
try {
  currentTheme = getTheme(opts.theme);
  log(`[shellwright] Transport: ${USE_HTTP ? "HTTP" : "stdio"}`);
  log(`[shellwright] Theme: ${currentTheme.name}`);
  log(`[shellwright] Font: ${FONT_FAMILY} @ ${FONT_SIZE}px`);
  log(`[shellwright] Terminal: ${COLS}x${ROWS}`);
  log(`[shellwright] Temp directory: ${TEMP_DIR}`);
  if (LOG_PATH) log(`[shellwright] Log path: ${LOG_PATH}`);
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
  theme: Theme;
  recording?: RecordingState;
}

const sessions = new Map<string, Session>();
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Build temp path: /tmp/shellwright/mcp-session-{mcpId}/{shellId}
function getSessionDir(mcpSessionId: string | undefined, shellSessionId: string): string {
  const mcpPart = mcpSessionId ? `mcp-session-${mcpSessionId}` : "mcp-session-unknown";
  return path.join(TEMP_DIR, mcpPart, shellSessionId);
}

// Build download URL for a file
function getDownloadUrl(mcpSessionId: string | undefined, shellSessionId: string, type: "screenshots" | "recordings", filename: string): string {
  const mcpPart = mcpSessionId ? `mcp-session-${mcpSessionId}` : "mcp-session-unknown";
  return `http://localhost:${PORT}/files/${mcpPart}/${shellSessionId}/${type}/${filename}`;
}

// Create Express app for file serving (used by both HTTP and stdio modes)
function createFileServer(): express.Express {
  const app = express();

  // Serve files from temp directory
  app.get("/files/*splat", async (req: Request, res: Response) => {
    const relativePath = (req.params as unknown as { splat: string[] }).splat.join("/");
    const filePath = path.join(TEMP_DIR, relativePath);

    // Security: ensure path is within TEMP_DIR
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(TEMP_DIR))) {
      res.status(403).send("Forbidden");
      return;
    }

    try {
      await fs.access(filePath);
      res.sendFile(resolved);
    } catch {
      res.status(404).send("Not found");
    }
  });

  return app;
}

const createServer = (getMcpSessionId: () => string | undefined) => {
  const server = new McpServer({
    name: "shellwright",
    version: "0.1.0",
  });

  server.tool(
    "shell_start",
    "Start a new PTY session with a command",
    {
      command: z.string().describe(
        "Command to run. Examples: 'bash', 'zsh', 'k9s', 'htop', 'vim'. " +
        "For interactive shell sessions that should match the user's normal terminal " +
        "(custom prompt, colors, aliases, PATH), use 'bash' or 'zsh' with args ['--login', '-i']. " +
        "For standalone TUI programs like k9s, htop, or vim, run the command directly without shell flags."
      ),
      args: z.array(z.string()).optional().describe(
        "Command arguments. For interactive shells (bash, zsh), use ['--login', '-i'] to source " +
        "the user's shell configuration (~/.bashrc, ~/.zshrc) which provides their custom prompt, " +
        "aliases, functions, and environment variables. Without these flags, shells start with a " +
        "minimal environment and basic prompt. Not needed for standalone programs like k9s or htop."
      ),
      cols: z.number().optional().describe(`Terminal columns (default: ${COLS})`),
      rows: z.number().optional().describe(`Terminal rows (default: ${ROWS})`),
      theme: z.string().optional().describe(
        (() => {
          const { dark, light } = getThemesByType();
          return `Color theme for screenshots and recordings. ` +
            `Dark themes: ${dark.join(", ")}. Light themes: ${light.join(", ")}. ` +
            `Default: ${DEFAULT_THEME}. ` +
            Object.values(themes).map(t => `'${t.name}': ${t.description}`).join(". ") + ".";
        })()
      ),
    },
    async ({ command, args, cols, rows, theme }) => {
      const id = `shell-session-${randomUUID().slice(0, 6)}`;
      const termCols = cols || COLS;
      const termRows = rows || ROWS;
      const sessionTheme = theme ? getTheme(theme) : currentTheme;

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
        theme: sessionTheme,
      };

      ptyProcess.onData((data) => {
        session.buffer.push(data);
        if (session.buffer.length > 1000) {
          session.buffer.shift();
        }
        terminal.write(data);
      });

      sessions.set(id, session);
      log(`[shellwright] Started session ${id}: ${command} (theme: ${sessionTheme.name})`);

      const output = { shell_session_id: id, theme: sessionTheme.name };
      logToolCall("shell_start", { command, args, cols, rows, theme }, output);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
      };
    }
  );

  server.tool(
    "shell_send",
    `Send input to a PTY session. Returns the full terminal buffer (plain text, no ANSI codes) before and after sending input, so you can see exactly what changed on screen.

Tips:
- Include \\r at the end of commands to execute them (e.g., "ls -la\\r")
- For vim: send "i" to enter insert mode BEFORE typing text, check bufferAfter for "-- INSERT --"
- Always check bufferAfter to verify your input had the expected effect
- Common escapes: Enter=\\r, Escape=\\x1b, Ctrl+C=\\x03, arrows=\\x1b[A/B/C/D`,
    {
      session_id: z.string().describe("Session ID"),
      input: z.string().describe("Input to send (supports escape sequences like \\x1b[A for arrow up)"),
      delay_ms: z.number().optional().describe("Milliseconds to wait after sending input before capturing 'bufferAfter' (default: 100). Increase for slow commands."),
    },
    async ({ session_id, input, delay_ms }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      const bufferBefore = bufferToText(session.terminal, session.cols, session.rows);

      const interpreted = interpretEscapes(input);
      session.pty.write(interpreted);
      log(`[shellwright] Sent to ${session_id}: ${JSON.stringify(input)}`);

      await new Promise((resolve) => setTimeout(resolve, delay_ms || 100));

      const bufferAfter = bufferToText(session.terminal, session.cols, session.rows);

      const output = { success: true, bufferBefore, bufferAfter };
      logToolCall("shell_send", { session_id, input, delay_ms }, output);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
      };
    }
  );

  server.tool(
    "shell_read",
    "Read the current terminal buffer as plain text (no ANSI codes)",
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

      log(`[shellwright] Read ${content.length} chars from ${session_id}`);
      logToolCall("shell_read", { session_id, raw }, { length: content.length });

      return {
        content: [{ type: "text" as const, text: content }],
      };
    }
  );

  server.tool(
    "shell_screenshot",
    "Capture terminal screenshot as PNG. Returns a download_url - use curl to save the file locally (e.g., curl -o screenshot.png <url>)",
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
      const filename = `${baseName}.png`;
      const sessionDir = getSessionDir(getMcpSessionId(), session_id);
      const screenshotDir = path.join(sessionDir, "screenshots");

      await fs.mkdir(screenshotDir, { recursive: true });

      // Generate all formats from xterm buffer
      const svg = bufferToSvg(session.terminal, session.cols, session.rows, { theme: session.theme, fontSize: FONT_SIZE, fontFamily: FONT_FAMILY });
      const png = new Resvg(svg, resvgOptions).render().asPng();
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

      log(`[shellwright] Screenshot saved: ${screenshotDir}/${baseName}.{png,svg,ansi,txt}`);

      const downloadUrl = getDownloadUrl(getMcpSessionId(), session_id, "screenshots", filename);
      const output = { filename, download_url: downloadUrl, hint: "Use curl -o <filename> <download_url> to save the file" };
      logToolCall("shell_screenshot", { session_id, name }, output);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
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
      log(`[shellwright] Stopped session ${session_id}`);

      const output = { success: true };
      logToolCall("shell_stop", { session_id }, output);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
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
      const sessionDir = getSessionDir(getMcpSessionId(), session_id);
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
          const svg = bufferToSvg(session.terminal, session.cols, session.rows, { theme: session.theme, fontSize: FONT_SIZE, fontFamily: FONT_FAMILY });
          const png = new Resvg(svg, resvgOptions).render().asPng();
          const framePath = path.join(framesDir, `frame${String(frameNum).padStart(6, "0")}.png`);
          await fs.writeFile(framePath, png);
        }, 1000 / recordingFps),
      };

      log(`[shellwright] Recording started: ${session_id} @ ${recordingFps} FPS → ${framesDir}`);

      const output = { recording: true, fps: recordingFps, frames_dir: framesDir };
      logToolCall("shell_record_start", { session_id, fps }, output);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
      };
    }
  );

  server.tool(
    "shell_record_stop",
    "Stop recording and save GIF. Returns a download_url - use curl to save the file locally (e.g., curl -o recording.gif <url>)",
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
      const sessionDir = getSessionDir(getMcpSessionId(), session_id);
      const recordingsDir = path.join(sessionDir, "recordings");
      const filePath = path.join(recordingsDir, filename);

      await fs.mkdir(recordingsDir, { recursive: true });

      // Render GIF
      await renderGif(framesDir, filePath, { fps });

      // Cleanup frames (keep the GIF for diagnostics)
      await fs.rm(framesDir, { recursive: true, force: true });
      session.recording = undefined;

      log(`[shellwright] Recording saved: ${filePath} (${frameCount} frames, ${durationMs}ms)`);

      const downloadUrl = getDownloadUrl(getMcpSessionId(), session_id, "recordings", filename);
      const output = { filename, download_url: downloadUrl, frame_count: frameCount, duration_ms: durationMs, hint: "Use curl -o <filename> <download_url> to save the file" };
      logToolCall("shell_record_stop", { session_id, name }, output);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
      };
    }
  );

  registerPrompts(server);

  return server;
};

// Start the appropriate transport
if (USE_HTTP) {
  // HTTP transport mode - MCP + file serving on same port
  const app = createFileServer();
  app.use(express.json());

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    log(`[shellwright] POST /mcp ${sessionId ? `session=${sessionId}` : "new"}`);

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        log(`[shellwright] New session initializing`);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            log(`[shellwright] Session initialized: ${sid}`);
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            log(`[shellwright] Session closed: ${sid}`);
            delete transports[sid];
          }
        };

        const server = createServer(() => transport.sessionId);
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
    log(`[shellwright] GET /mcp session=${sessionId}`);

    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    log(`[shellwright] DELETE /mcp session=${sessionId}`);

    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, () => {
    log(`[shellwright] MCP server running at http://localhost:${PORT}/mcp`);
    log(`[shellwright] File server running at http://localhost:${PORT}/files`);
  });

  process.on("SIGINT", async () => {
    log("[shellwright] Shutting down...");
    for (const sessionId in transports) {
      await transports[sessionId].close();
    }
    process.exit(0);
  });
} else {
  // Stdio transport mode (default) - MCP over stdio, file server on HTTP
  const stdioSessionId = randomUUID();
  const transport = new StdioServerTransport();
  const server = createServer(() => stdioSessionId);

  // Start HTTP file server (needed for download URLs)
  const fileServer = createFileServer();
  fileServer.listen(PORT, () => {
    log(`[shellwright] File server running at http://localhost:${PORT}/files`);
  });

  log(`[shellwright] Session: ${stdioSessionId}`);

  server.connect(transport).then(() => {
    log(`[shellwright] MCP server ready (stdio)`);
  }).catch((error) => {
    console.error("[shellwright] Failed to start:", error);
    process.exit(1);
  });

  process.on("SIGINT", async () => {
    log("[shellwright] Shutting down...");
    await transport.close();
    process.exit(0);
  });
}
