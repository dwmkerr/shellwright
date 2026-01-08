#!/usr/bin/env npx tsx
/**
 * Generate HTML comparison page for evaluation recordings.
 */

import Handlebars from "handlebars";
import * as fs from "fs/promises";
import * as path from "path";

const SCENARIOS_DIR = path.join(import.meta.dirname, "scenarios");
const TEMPLATE_PATH = path.join(import.meta.dirname, "template.html");

async function getFileSize(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    return `${(stat.size / 1024).toFixed(1)}KB`;
  } catch {
    return null;
  }
}

function baselineUrl(scenario: string, filename: string): string {
  const repo = process.env.GITHUB_REPOSITORY || "dwmkerr/shellwright";
  const branch = process.env.GITHUB_HEAD_REF || "main";
  return `https://raw.githubusercontent.com/${repo}/${branch}/evaluations/scenarios/${scenario}/${filename}`;
}

async function main() {
  const entries = await fs.readdir(SCENARIOS_DIR, { withFileTypes: true });

  const scenarios = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => ({
        name: e.name,
        baselineLocalSize: await getFileSize(path.join(SCENARIOS_DIR, e.name, "baseline-local.gif")),
        baselineLocalUrl: baselineUrl(e.name, "baseline-local.gif"),
        baselineCicdSize: await getFileSize(path.join(SCENARIOS_DIR, e.name, "baseline-cicd.gif")),
        baselineCicdUrl: baselineUrl(e.name, "baseline-cicd.gif"),
        recordedSize: await getFileSize(path.join(SCENARIOS_DIR, e.name, "recording.gif")),
      }))
  );

  const templateSrc = await fs.readFile(TEMPLATE_PATH, "utf-8");
  const template = Handlebars.compile(templateSrc);
  const html = template({ scenarios });

  await fs.writeFile(path.join(SCENARIOS_DIR, "index.html"), html);
  console.log("Generated index.html");
}

main().catch(console.error);
