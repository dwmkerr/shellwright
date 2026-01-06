#!/usr/bin/env npx tsx
/**
 * Generate comparison table for evaluation recordings.
 * Outputs markdown suitable for GitHub Actions summary or PR comments.
 */

import * as fs from "fs/promises";
import * as path from "path";

const SCENARIOS_DIR = path.join(import.meta.dirname, "scenarios");

interface RecordingStats {
  name: string;
  exists: boolean;
  sizeBytes?: number;
  sizeKb?: string;
}

async function getRecordingStats(scenarioPath: string): Promise<RecordingStats> {
  const name = path.basename(scenarioPath);
  const gifPath = path.join(scenarioPath, "recording.gif");

  try {
    const stat = await fs.stat(gifPath);
    return {
      name,
      exists: true,
      sizeBytes: stat.size,
      sizeKb: `${(stat.size / 1024).toFixed(1)}KB`,
    };
  } catch {
    return { name, exists: false };
  }
}

async function main() {
  const scenarios = await fs.readdir(SCENARIOS_DIR);
  const stats: RecordingStats[] = [];

  for (const scenario of scenarios) {
    const scenarioPath = path.join(SCENARIOS_DIR, scenario);
    const stat = await fs.stat(scenarioPath);
    if (stat.isDirectory()) {
      stats.push(await getRecordingStats(scenarioPath));
    }
  }

  // Output markdown table
  console.log("## Recording Evaluation Results\n");
  console.log("| Scenario | Status | Size |");
  console.log("|----------|--------|------|");

  for (const s of stats) {
    const status = s.exists ? "✅ Generated" : "❌ Missing";
    const size = s.sizeKb || "-";
    console.log(`| ${s.name} | ${status} | ${size} |`);
  }

  console.log("\n### Recordings\n");
  for (const s of stats) {
    if (s.exists) {
      console.log(`#### ${s.name}\n`);
      console.log(`![${s.name}](./scenarios/${s.name}/recording.gif)\n`);
    }
  }
}

main().catch(console.error);
