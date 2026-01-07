#!/usr/bin/env npx tsx
/**
 * Generate comparison table for evaluation recordings.
 * Outputs both markdown (for workflow summary) and HTML (for GitHub Pages preview).
 */

import * as fs from "fs/promises";
import * as path from "path";

const SCENARIOS_DIR = path.join(import.meta.dirname, "scenarios");

interface ScenarioComparison {
  name: string;
  baseline: { exists: boolean; sizeKb?: string };
  recorded: { exists: boolean; sizeKb?: string };
}

async function getFileStats(filePath: string): Promise<{ exists: boolean; sizeKb?: string }> {
  try {
    const stat = await fs.stat(filePath);
    return {
      exists: true,
      sizeKb: `${(stat.size / 1024).toFixed(1)}KB`,
    };
  } catch {
    return { exists: false };
  }
}

async function getScenarioComparison(scenarioPath: string): Promise<ScenarioComparison> {
  const name = path.basename(scenarioPath);
  const baselinePath = path.join(scenarioPath, "baseline.gif");
  const recordedPath = path.join(scenarioPath, "recording.gif");

  return {
    name,
    baseline: await getFileStats(baselinePath),
    recorded: await getFileStats(recordedPath),
  };
}

function getBaselineUrl(scenario: string): string {
  const repo = process.env.GITHUB_REPOSITORY || "dwmkerr/shellwright";
  const branch = process.env.GITHUB_HEAD_REF || "main";
  return `https://raw.githubusercontent.com/${repo}/${branch}/evaluations/scenarios/${scenario}/baseline.gif`;
}

function getRecordedUrl(scenario: string): string {
  // For HTML, use relative path since it's deployed alongside
  return `./${scenario}/recording.gif`;
}

function getRecordedUrlForMarkdown(scenario: string): string | null {
  const previewUrl = process.env.PREVIEW_URL;
  if (!previewUrl) return null;
  return `${previewUrl}${scenario}/recording.gif`;
}

function generateHtml(comparisons: ScenarioComparison[]): string {
  const rows = comparisons.map(c => {
    const baselineSize = c.baseline.exists ? c.baseline.sizeKb : "Missing";
    const recordedSize = c.recorded.exists ? c.recorded.sizeKb : "Missing";

    const baselineImg = c.baseline.exists
      ? `<img src="${getBaselineUrl(c.name)}" alt="baseline" style="max-width: 100%;">`
      : '<span class="missing">No baseline</span>';

    const recordedImg = c.recorded.exists
      ? `<img src="${getRecordedUrl(c.name)}" alt="recorded" style="max-width: 100%;">`
      : '<span class="missing">Not generated</span>';

    return `
      <tr>
        <td class="scenario"><strong>${c.name}</strong></td>
        <td class="preview">
          <div class="size">${baselineSize}</div>
          ${baselineImg}
        </td>
        <td class="preview">
          <div class="size">${recordedSize}</div>
          ${recordedImg}
        </td>
      </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recording Evaluation</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      margin: 0; padding: 20px; background: #0d1117; color: #c9d1d9;
    }
    h1 { color: #58a6ff; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; border: 1px solid #30363d; text-align: left; vertical-align: top; }
    th { background: #161b22; color: #58a6ff; }
    .scenario { width: 150px; font-weight: bold; }
    .preview { width: 45%; }
    .preview img { max-width: 100%; border-radius: 6px; margin-top: 8px; }
    .size { font-size: 12px; color: #8b949e; }
    .missing { color: #f85149; font-style: italic; }
  </style>
</head>
<body>
  <h1>Recording Evaluation</h1>
  <table>
    <thead>
      <tr>
        <th>Scenario</th>
        <th>Baseline</th>
        <th>PR</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

function generateMarkdown(comparisons: ScenarioComparison[]): string {
  let md = "## Recording Evaluation\n\n";
  md += "| Scenario | Baseline | PR |\n";
  md += "|----------|----------|----|\n";

  for (const c of comparisons) {
    const baselineSize = c.baseline.exists ? c.baseline.sizeKb : "❌ Missing";
    const baselineImg = c.baseline.exists
      ? `![baseline](${getBaselineUrl(c.name)})`
      : "";

    const recordedUrl = getRecordedUrlForMarkdown(c.name);
    const recordedSize = c.recorded.exists ? c.recorded.sizeKb : "❌ Missing";
    const recordedImg = c.recorded.exists && recordedUrl
      ? `![recorded](${recordedUrl})`
      : c.recorded.exists
        ? "*(download artifact)*"
        : "";

    md += `| **${c.name}** | ${baselineSize}<br/>${baselineImg} | ${recordedSize}<br/>${recordedImg} |\n`;
  }

  return md;
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

  // Generate and write HTML for GitHub Pages preview
  const html = generateHtml(comparisons);
  await fs.writeFile(path.join(SCENARIOS_DIR, "index.html"), html);
  console.error("Generated index.html");

  // Output markdown to stdout for workflow summary
  console.log(generateMarkdown(comparisons));
}

main().catch(console.error);
