#!/usr/bin/env npx tsx
/**
 * Run evaluation scenarios using Claude Agent SDK with shellwright MCP.
 * Iterates through scenarios and generates recordings from prompt.md files.
 */

import dotenv from "dotenv";
dotenv.config({ override: true });
import { query } from "@anthropic-ai/claude-agent-sdk";
import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";

const SCENARIOS_DIR = path.join(import.meta.dirname, "scenarios");
const LOGS_DIR = path.join(import.meta.dirname, "logs");
const SHELLWRIGHT_LOG = path.join(LOGS_DIR, "shellwright.jsonl");
const AGENT_LOG = path.join(LOGS_DIR, "agent.jsonl");

// Resolve shellwright repo root - allows us to run the evaluations code and
// specify exactly where to find the raw code for the MCP server (as we
// evaluate against the local code).
function getShellwrightRoot(): string {
  const envPath = process.env.SHELLWRIGHT_ROOT;
  if (envPath) {
    return path.resolve(import.meta.dirname, envPath);
  }
  // Default: parent directory of evaluations
  return path.resolve(import.meta.dirname, "..");
}

const ROOT_DIR = getShellwrightRoot();

interface ScenarioResult {
  name: string;
  success: boolean;
  gifPath?: string;
  error?: string;
}

async function downloadGif(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download GIF: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  await fs.writeFile(destPath, Buffer.from(buffer));
}

async function runScenario(scenarioPath: string): Promise<ScenarioResult> {
  const scenarioName = path.basename(scenarioPath);
  const promptPath = path.join(scenarioPath, "prompt.md");
  const prompt = await fs.readFile(promptPath, "utf-8");

  console.log(`\n=== Running scenario: ${scenarioName} ===`);

  try {
    let toolsCalled = 0;
    let gifPath: string | null = null;
    const mcpScript = path.join(ROOT_DIR, "dist/index.js");
    console.log(`  Starting agent with MCP server: ${mcpScript}`);
    for await (const message of query({
      prompt: `You have access to shellwright MCP tools for terminal recording. Use the shellwright tools (mcp__shellwright__shell_start, mcp__shellwright__shell_send, mcp__shellwright__shell_record_start, mcp__shellwright__shell_record_stop, etc.) to execute the following scenario.

Save the recording as "recording" (it will become recording.gif).

${prompt}`,
      options: {
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        mcpServers: {
          shellwright: {
            command: "node",
            args: [mcpScript, "--log-path", SHELLWRIGHT_LOG],
          },
        },
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            toolsCalled++;
            console.log(`  Tool: ${block.name}`);
          } else if (block.type === "text") {
            console.log(`  Assistant: ${block.text.slice(0, 100)}...`);
          }
        }
      } else if (message.type === "user") {
        // Capture tool results to extract download_url
        for (const block of message.message.content) {
          if (block.type === "tool_result") {
            const content = typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((c: { text?: string }) => c.text || "").join("")
                : JSON.stringify(block.content);
            let parsed;
            try {
              parsed = JSON.parse(content);
            } catch {
              continue; // Not JSON, skip
            }
            if (parsed.download_url && !gifPath) {
              const dest = path.join(scenarioPath, "recording.gif");
              console.log(`  Downloading: ${parsed.download_url}`);
              await downloadGif(parsed.download_url, dest);
              gifPath = dest;
              console.log(`  ✓ Recording saved: ${gifPath}`);
            }
          }
        }
      } else if (message.type === "result") {
        console.log(`  Result: ${message.subtype} (${toolsCalled} tools called)`);
        if (toolsCalled === 0) {
          throw new Error("No tools were called - check API key and MCP server configuration");
        }
      }
    }

    if (gifPath) {
      return { name: scenarioName, success: true, gifPath };
    }

    return { name: scenarioName, success: false, error: "No recording generated" };
  } catch (err) {
    console.error(`  ✗ Error: ${(err as Error).message}`);
    return { name: scenarioName, success: false, error: (err as Error).message };
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable required");
    process.exit(1);
  }

  // Create logs directory
  await fs.mkdir(LOGS_DIR, { recursive: true });

  // Set agent log path
  process.env.CLAUDE_AGENT_LOG = AGENT_LOG;

  // Build shellwright first
  console.log(`Shellwright root: ${ROOT_DIR}`);
  console.log("Building shellwright...");
  execSync("npm run build", { stdio: "inherit", cwd: ROOT_DIR });

  // Find all scenarios
  const scenarios = await fs.readdir(SCENARIOS_DIR);
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const scenarioPath = path.join(SCENARIOS_DIR, scenario);
    const stat = await fs.stat(scenarioPath);
    if (stat.isDirectory()) {
      const result = await runScenario(scenarioPath);
      results.push(result);
    }
  }

  // Print summary
  console.log("\n=== Results ===");
  for (const r of results) {
    const status = r.success ? "✓" : "✗";
    console.log(`${status} ${r.name}: ${r.success ? r.gifPath : r.error}`);
  }

  console.log("\n=== Logs ===");
  console.log(`Shellwright: ${SHELLWRIGHT_LOG}`);
  console.log(`Agent: ${AGENT_LOG}`);

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
