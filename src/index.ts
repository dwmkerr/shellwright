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

const PORT = parseInt(process.env.PORT || "7498", 10);
const BACKGROUND = process.argv.includes("--background") || process.argv.includes("-b");

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
  // Set a clean TERM
  env.TERM = "xterm-256color";
  return env;
}

// Render terminal screen as text grid (cols x rows)
function renderScreen(terminal: InstanceType<typeof Terminal>, cols: number, rows: number): string {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const line = buffer.getLine(i);
    if (line) {
      lines.push(line.translateToString(true).padEnd(cols));
    } else {
      lines.push("".padEnd(cols));
    }
  }
  return lines.join("\n");
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

interface Session {
  id: string;
  pty: pty.IPty;
  cols: number;
  rows: number;
  buffer: string[];
  terminal: InstanceType<typeof Terminal>;
}

const sessions = new Map<string, Session>();
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

const createServer = () => {
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
      cols: z.number().optional().describe("Terminal columns (default: 120)"),
      rows: z.number().optional().describe("Terminal rows (default: 40)"),
    },
    async ({ command, args, cols, rows }) => {
      const id = randomUUID();
      const termCols = cols || 120;
      const termRows = rows || 40;

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
        content: [{ type: "text" as const, text: JSON.stringify({ session_id: id }) }],
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

      session.pty.write(input);
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
    "shell_snapshot",
    "Get the current terminal screen as rendered text grid (like Playwright browser_snapshot)",
    {
      session_id: z.string().describe("Session ID"),
    },
    async ({ session_id }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      const screen = renderScreen(session.terminal, session.cols, session.rows);
      console.log(`[shellwright] Snapshot ${session.cols}x${session.rows} from ${session_id}`);

      return {
        content: [{ type: "text" as const, text: screen }],
      };
    }
  );

  server.tool(
    "shell_screenshot",
    "Capture terminal state to files (raw ANSI + rendered screen)",
    {
      session_id: z.string().describe("Session ID"),
      output: z.string().describe("Output file path (without extension)"),
    },
    async ({ session_id, output }) => {
      const session = sessions.get(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }

      const rawContent = session.buffer.join("");
      const renderedScreen = renderScreen(session.terminal, session.cols, session.rows);

      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output + ".ansi", rawContent);
      await fs.writeFile(output + ".txt", renderedScreen);

      console.log(`[shellwright] Screenshot saved: ${output}.txt and ${output}.ansi`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          txt: output + ".txt",
          ansi: output + ".ansi",
          preview: renderedScreen.slice(0, 2000)
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

      session.pty.kill();
      sessions.delete(session_id);
      console.log(`[shellwright] Stopped session ${session_id}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
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

      const server = createServer();
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
