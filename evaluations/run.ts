#!/usr/bin/env npx tsx
/**
 * Run evaluation scenarios using Claude Agent SDK with shellwright MCP.
 * Iterates through scenarios and generates recordings from prompt.md files.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";

const SCENARIOS_DIR = path.join(import.meta.dirname, "scenarios");
const ROOT_DIR = path.join(import.meta.dirname, "..");

interface ScenarioResult {
  name: string;
  success: boolean;
  gifPath?: string;
  error?: string;
}

async function findGeneratedGif(): Promise<string | null> {
  const tempDir = "/tmp/shellwright";
  try {
    const entries = await fs.readdir(tempDir, { recursive: true });
    for (const entry of entries) {
      if (entry.toString().endsWith("recording.gif")) {
        return path.join(tempDir, entry.toString());
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function runScenario(scenarioPath: string): Promise<ScenarioResult> {
  const scenarioName = path.basename(scenarioPath);
  const promptPath = path.join(scenarioPath, "prompt.md");
  const prompt = await fs.readFile(promptPath, "utf-8");

  console.log(`\n=== Running scenario: ${scenarioName} ===`);

  try {
    let toolsCalled = 0;
    for await (const message of query({
      prompt: `You are testing shellwright, a terminal recording tool. Execute the following scenario and create a recording.

Save the recording as "recording" (it will become recording.gif).

${prompt}`,
      options: {
        mcpServers: {
          shellwright: {
            command: "node",
            args: ["dist/index.js"],
            cwd: ROOT_DIR,
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
            const text = block.text;
            if (text.includes("Invalid API key")) {
              throw new Error("Invalid or missing ANTHROPIC_API_KEY. Set it with: export ANTHROPIC_API_KEY=your-key");
            }
            console.log(`  Assistant: ${text.slice(0, 100)}...`);
          }
        }
      } else if (message.type === "result") {
        if (toolsCalled === 0) {
          throw new Error("No tools were called - check API key and MCP server configuration");
        }
        console.log(`  Completed: ${message.subtype} (${toolsCalled} tools called)`);
      }
    }

    // Find and copy the generated GIF
    const tempGif = await findGeneratedGif();
    if (tempGif) {
      const gifPath = path.join(scenarioPath, "recording.gif");
      await fs.copyFile(tempGif, gifPath);
      console.log(`  ✓ Recording saved: ${gifPath}`);
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

  // Build shellwright first
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

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
