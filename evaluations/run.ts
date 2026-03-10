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

interface Artifact {
  filename: string;
  localPath: string;
}

interface ScenarioResult {
  name: string;
  success: boolean;
  artifacts: Artifact[];
  error?: string;
}

async function downloadArtifact(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download artifact: ${response.status}`);
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
    const artifacts: Artifact[] = [];
    const mcpScript = path.join(ROOT_DIR, "dist/index.js");
    console.log(`  Starting agent with MCP server: ${mcpScript}`);
    for await (const message of query({
      prompt: `You have access to shellwright MCP tools for terminal recording and screenshots. Use the shellwright tools (mcp__shellwright__shell_start, mcp__shellwright__shell_send, mcp__shellwright__shell_record_start, mcp__shellwright__shell_record_stop, mcp__shellwright__shell_screenshot, etc.) to execute the following scenario.

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
        // Capture tool results to extract download URLs
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
            const downloadUrls: { url: string; filename: string }[] = [];
            if (parsed.download_png_url && parsed.filename) {
              downloadUrls.push({ url: parsed.download_png_url, filename: parsed.filename });
            }
            if (parsed.download_svg_url && parsed.filename) {
              const svgFilename = parsed.filename.replace(/\.png$/i, ".svg");
              downloadUrls.push({ url: parsed.download_svg_url, filename: svgFilename });
            }
            if (parsed.download_gif_url && parsed.filename) {
              downloadUrls.push({ url: parsed.download_gif_url, filename: parsed.filename });
            }
            for (const { url, filename } of downloadUrls) {
              const dest = path.join(scenarioPath, filename);
              console.log(`  Downloading: ${url} → ${filename}`);
              await downloadArtifact(url, dest);
              artifacts.push({ filename, localPath: dest });
              console.log(`  ✓ Artifact saved: ${dest}`);
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

    if (artifacts.length > 0) {
      return { name: scenarioName, success: true, artifacts };
    }

    return { name: scenarioName, success: false, artifacts: [], error: "No artifacts generated" };
  } catch (err) {
    console.error(`  ✗ Error: ${(err as Error).message}`);
    return { name: scenarioName, success: false, artifacts: [], error: (err as Error).message };
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

  // Find all scenarios, optionally filtered by command line argument
  const filterArg = process.argv[2];
  let scenarios = await fs.readdir(SCENARIOS_DIR);
  if (filterArg) {
    scenarios = scenarios.filter((s) => s.includes(filterArg));
    if (scenarios.length === 0) {
      console.error(`No scenarios matching "${filterArg}"`);
      process.exit(1);
    }
  }
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
    const detail = r.success
      ? r.artifacts.map((a) => a.filename).join(", ")
      : r.error;
    console.log(`${status} ${r.name}: ${detail}`);
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
