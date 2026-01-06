#!/usr/bin/env npx tsx
/**
 * Run evaluation scenarios using Claude API with shellwright MCP tools.
 * Iterates through scenarios/*/prompt.md and generates recordings.
 */

import Anthropic from "@anthropic-ai/sdk";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

const SCENARIOS_DIR = path.join(import.meta.dirname, "scenarios");
const SHELLWRIGHT_PORT = 7499; // Use different port to avoid conflicts

// Shellwright tool definitions for Claude
const TOOLS: Anthropic.Tool[] = [
  {
    name: "shell_start",
    description: "Start a new PTY session",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Command to run (e.g., 'bash')" },
        args: { type: "array", items: { type: "string" }, description: "Command arguments" },
        cols: { type: "number", description: "Terminal columns" },
        rows: { type: "number", description: "Terminal rows" },
        theme: { type: "string", description: "Color theme" },
      },
      required: ["command"],
    },
  },
  {
    name: "shell_send",
    description: "Send input to a PTY session",
    input_schema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session ID" },
        input: { type: "string", description: "Input to send" },
        delay_ms: { type: "number", description: "Delay after sending" },
      },
      required: ["session_id", "input"],
    },
  },
  {
    name: "shell_stop",
    description: "Stop a PTY session",
    input_schema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session ID" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "shell_record_start",
    description: "Start recording a terminal session",
    input_schema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session ID" },
        fps: { type: "number", description: "Frames per second" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "shell_record_stop",
    description: "Stop recording and save GIF",
    input_schema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session ID" },
        name: { type: "string", description: "Recording name" },
      },
      required: ["session_id"],
    },
  },
];

interface McpResponse {
  result?: { content: Array<{ type: string; text: string }> };
  error?: { message: string };
}

class ShellwrightClient {
  private sessionId: string | null = null;

  constructor(private baseUrl: string) {}

  async initialize(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "eval-runner", version: "1.0.0" },
        },
      }),
    });
    const data = await response.json();
    this.sessionId = response.headers.get("mcp-session-id");
    return data;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.sessionId && { "mcp-session-id": this.sessionId }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    const data: McpResponse = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.result?.content[0]?.text || "";
  }
}

async function startShellwright(): Promise<ChildProcess> {
  console.log("Starting shellwright server...");
  const proc = spawn("node", ["dist/index.js", "--http", "--port", String(SHELLWRIGHT_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Shellwright startup timeout")), 10000);
    proc.stderr?.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("MCP server running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on("error", reject);
  });

  console.log(`Shellwright running on port ${SHELLWRIGHT_PORT}`);
  return proc;
}

async function runScenario(
  scenarioPath: string,
  client: ShellwrightClient,
  anthropic: Anthropic
): Promise<{ name: string; success: boolean; gifPath?: string; error?: string }> {
  const scenarioName = path.basename(scenarioPath);
  const promptPath = path.join(scenarioPath, "prompt.md");
  const prompt = await fs.readFile(promptPath, "utf-8");

  console.log(`\n=== Running scenario: ${scenarioName} ===`);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `You are testing shellwright, a terminal recording tool. Execute the following scenario and create a recording.

IMPORTANT:
- Use delay_ms of 800-1000ms between steps for visible pacing
- Save the recording as "recording" (it will become recording.gif)
- Execute steps quickly without unnecessary pauses between tool calls

${prompt}`,
    },
  ];

  try {
    let continueLoop = true;
    while (continueLoop) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        tools: TOOLS,
        messages,
      });

      // Process response
      const assistantContent: Anthropic.ContentBlock[] = [];
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        assistantContent.push(block);

        if (block.type === "tool_use") {
          console.log(`  Tool: ${block.name}(${JSON.stringify(block.input).slice(0, 100)}...)`);
          try {
            const result = await client.callTool(block.name, block.input as Record<string, unknown>);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
          } catch (err) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: ${(err as Error).message}`,
              is_error: true,
            });
          }
        }
      }

      messages.push({ role: "assistant", content: assistantContent });

      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }

      if (response.stop_reason === "end_turn" || toolResults.length === 0) {
        continueLoop = false;
      }
    }

    // Check if recording was created
    const gifPath = path.join(scenarioPath, "recording.gif");
    // Copy from shellwright temp dir if exists
    const tempGifs = await findGeneratedGif();
    if (tempGifs) {
      await fs.copyFile(tempGifs, gifPath);
      console.log(`  ✓ Recording saved: ${gifPath}`);
      return { name: scenarioName, success: true, gifPath };
    }

    return { name: scenarioName, success: false, error: "No recording generated" };
  } catch (err) {
    return { name: scenarioName, success: false, error: (err as Error).message };
  }
}

async function findGeneratedGif(): Promise<string | null> {
  const tempDir = "/tmp/shellwright";
  try {
    const sessions = await fs.readdir(tempDir);
    for (const session of sessions) {
      const recordingsDir = path.join(tempDir, session);
      const entries = await fs.readdir(recordingsDir, { recursive: true });
      for (const entry of entries) {
        if (entry.toString().endsWith(".gif")) {
          return path.join(recordingsDir, entry.toString());
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable required");
    process.exit(1);
  }

  const anthropic = new Anthropic();
  let shellwright: ChildProcess | null = null;

  try {
    // Build first
    console.log("Building shellwright...");
    const { execSync } = await import("child_process");
    execSync("npm run build", { stdio: "inherit" });

    shellwright = await startShellwright();

    const client = new ShellwrightClient(`http://localhost:${SHELLWRIGHT_PORT}`);
    await client.initialize();

    // Find all scenarios
    const scenarios = await fs.readdir(SCENARIOS_DIR);
    const results = [];

    for (const scenario of scenarios) {
      const scenarioPath = path.join(SCENARIOS_DIR, scenario);
      const stat = await fs.stat(scenarioPath);
      if (stat.isDirectory()) {
        const result = await runScenario(scenarioPath, client, anthropic);
        results.push(result);
      }
    }

    // Print summary
    console.log("\n=== Results ===");
    for (const r of results) {
      const status = r.success ? "✓" : "✗";
      console.log(`${status} ${r.name}: ${r.success ? r.gifPath : r.error}`);
    }
  } finally {
    if (shellwright) {
      shellwright.kill();
    }
  }
}

main().catch(console.error);
