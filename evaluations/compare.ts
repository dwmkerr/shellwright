#!/usr/bin/env npx tsx
/**
 * Generate comparison table for evaluation recordings.
 * Compares baseline (committed) vs recorded (generated) GIFs.
 * Outputs markdown suitable for GitHub Actions summary.
 */

import * as fs from "fs/promises";
import * as path from "path";

const SCENARIOS_DIR = path.join(import.meta.dirname, "scenarios");

interface ScenarioComparison {
  name: string;
  baseline: { exists: boolean; sizeKb?: string };
  recorded: { exists: boolean; sizeKb?: string };
}

async function getFileStats(filePath: string): Promise<{ exists: boolean; sizeKb?: string; sizeBytes?: number }> {
  try {
    const stat = await fs.stat(filePath);
    return {
      exists: true,
      sizeKb: `${(stat.size / 1024).toFixed(1)}KB`,
      sizeBytes: stat.size,
    };
  } catch {
    return { exists: false };
  }
}

async function getScenarioComparison(scenarioPath: string): Promise<ScenarioComparison> {
  const name = path.basename(scenarioPath);
  const baselinePath = path.join(scenarioPath, "baseline.gif");
  const recordedPath = path.join(scenarioPath, "recording.gif");

  const baseline = await getFileStats(baselinePath);
  const recorded = await getFileStats(recordedPath);

  return {
    name,
    baseline,
    recorded,
  };
}

function getBaselineUrl(scenario: string): string {
  const repo = process.env.GITHUB_REPOSITORY || "dwmkerr/shellwright";
  return `https://raw.githubusercontent.com/${repo}/main/evaluations/scenarios/${scenario}/baseline.gif`;
}

function getRecordedUrl(scenario: string): string | null {
  const previewUrl = process.env.PREVIEW_URL;
  if (!previewUrl) return null;
  // Preview URL is like https://owner.github.io/repo/pr-preview/pr-123/
  // Files are at: {previewUrl}{scenario}/recording.gif
  return `${previewUrl}${scenario}/recording.gif`;
}

async function main() {
  const scenarios = await fs.readdir(SCENARIOS_DIR);
  const comparisons: ScenarioComparison[] = [];

  for (const scenario of scenarios) {
    const scenarioPath = path.join(SCENARIOS_DIR, scenario);
    const stat = await fs.stat(scenarioPath);
    if (stat.isDirectory()) {
      comparisons.push(await getScenarioComparison(scenarioPath));
    }
  }

  // Output comparison table
  console.log("## Recording Evaluation Results\n");
  console.log("| Scenario | Baseline | Recorded | Status |");
  console.log("|----------|----------|----------|--------|");

  for (const c of comparisons) {
    const baselineSize = c.baseline.sizeKb || "❌ Missing";
    const recordedSize = c.recorded.sizeKb || "❌ Missing";
    let status = "⚠️ Review";
    if (!c.baseline.exists && c.recorded.exists) status = "🆕 New";
    if (c.baseline.exists && !c.recorded.exists) status = "❌ Failed";
    if (c.baseline.exists && c.recorded.exists) status = "✅ Compare";
    console.log(`| ${c.name} | ${baselineSize} | ${recordedSize} | ${status} |`);
  }

  // Show side-by-side comparisons
  console.log("\n### Side-by-Side Comparisons\n");

  for (const c of comparisons) {
    console.log(`#### ${c.name}\n`);
    console.log("| Baseline | Recorded |");
    console.log("|----------|----------|");

    const baselineCell = c.baseline.exists
      ? `![baseline](${getBaselineUrl(c.name)})`
      : "No baseline";

    const recordedUrl = getRecordedUrl(c.name);
    const recordedCell = c.recorded.exists
      ? recordedUrl
        ? `![recorded](${recordedUrl})`
        : `✅ Generated (${c.recorded.sizeKb}) - download artifact`
      : "❌ Not generated";

    console.log(`| ${baselineCell} | ${recordedCell} |\n`);
  }

  // Summary
  const hasFailures = comparisons.some(c => !c.recorded.exists);
  const hasNew = comparisons.some(c => !c.baseline.exists && c.recorded.exists);

  if (hasNew) {
    console.log("\n> **Note:** New recordings need baseline files. Run locally and commit baseline.gif files.\n");
  }
  if (hasFailures) {
    console.log("\n> **Warning:** Some recordings failed to generate.\n");
  }
  if (!process.env.PREVIEW_URL) {
    console.log("\n> **Note:** Running locally - recorded images not hosted. Set PREVIEW_URL to embed.\n");
  }
}

main().catch(console.error);
