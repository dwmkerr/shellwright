#!/usr/bin/env node

import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { Resvg, ResvgRenderOptions } from "@resvg/resvg-js";
import { registerPrompts } from "./prompts.js";
import {
  shellStart,
  shellStartSchema,
  shellSend,
  shellSendSchema,
  shellRead,
  shellReadSchema,
  shellScreenshot,
  shellScreenshotSchema,
  shellStop,
  shellStopSchema,
  shellRecordStart,
  shellRecordStartSchema,
  shellRecordStop,
  shellRecordStopSchema,
  Session,
  ToolContext,
} from "./tools/index.js";

// Use system fonts for proper text rendering (resvg ignores them by default).
// Scale 2x for crisp output on retina displays.
const resvgOptions: ResvgRenderOptions = {
  font: { loadSystemFonts: true },
  fitTo: { mode: "zoom", value: 2 },
};
import { Command } from "commander";
import { getTheme, themes, DEFAULT_THEME } from "./lib/themes.js";

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

// Ensure log directory exists
if (LOG_PATH) {
  const logDir = path.dirname(LOG_PATH);
  fsSync.mkdirSync(logDir, { recursive: true });
}

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

let currentTheme: ReturnType<typeof getTheme>;
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

  // Create tool context for all tools
  const toolContext: ToolContext = {
    sessions,
    getMcpSessionId,
    getSessionDir,
    getDownloadUrl,
    log,
    logToolCall,
    config: {
      PORT,
      FONT_SIZE,
      FONT_FAMILY,
      COLS,
      ROWS,
    },
    resvgOptions,
  };

  server.tool(
    "shell_start",
    "Start a new PTY session with a command",
    shellStartSchema,
    async (params) => shellStart(params, toolContext)
  );

  server.tool(
    "shell_send",
    `Send input to a PTY session. Returns the full terminal buffer (plain text, no ANSI codes) before and after sending input, so you can see exactly what changed on screen.

Tips:
- Include \\r at the end of commands to execute them (e.g., "ls -la\\r")
- For vim: send "i" to enter insert mode BEFORE typing text, check bufferAfter for "-- INSERT --"
- Always check bufferAfter to verify your input had the expected effect
- Common escapes: Enter=\\r, Escape=\\x1b, Ctrl+C=\\x03, arrows=\\x1b[A/B/C/D`,
    shellSendSchema,
    async (params) => shellSend(params, toolContext)
  );

  server.tool(
    "shell_read",
    "Read the current terminal buffer as plain text (no ANSI codes)",
    shellReadSchema,
    async (params) => shellRead(params, toolContext)
  );

  server.tool(
    "shell_screenshot",
    "Capture terminal screenshot as PNG and SVG. Returns png_url and svg_url - use curl to save (e.g., curl -o screenshot.png <png_url>)",
    shellScreenshotSchema,
    async (params) => shellScreenshot(params, toolContext)
  );

  server.tool(
    "shell_stop",
    "Stop a PTY session",
    shellStopSchema,
    async (params) => shellStop(params, toolContext)
  );

  server.tool(
    "shell_record_start",
    "Start recording a terminal session (captures frames for GIF/video export)",
    shellRecordStartSchema,
    async (params) => shellRecordStart(params, toolContext)
  );

  server.tool(
    "shell_record_stop",
    "Stop recording and save GIF. Returns a download_url - use curl to save the file locally (e.g., curl -o recording.gif <url>)",
    shellRecordStopSchema,
    async (params) => shellRecordStop(params, toolContext)
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
