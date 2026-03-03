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

interface ArtifactData {
  artifactName: string;
  baselineLocalSize: string | null;
  baselineLocalUrl: string;
  baselineCicdSize: string | null;
  baselineCicdUrl: string;
  recordedSize: string | null;
  recordedPath: string;
}

interface ScenarioData {
  name: string;
  artifacts: ArtifactData[];
  artifactCount: number;
}

async function discoverArtifacts(scenarioDir: string, scenarioName: string): Promise<ArtifactData[]> {
  const files = await fs.readdir(scenarioDir);
  const artifactFiles = files.filter(
    (f) => (f.endsWith(".gif") || f.endsWith(".png")) && !f.startsWith("baseline-")
  );
  artifactFiles.sort();

  return Promise.all(
    artifactFiles.map(async (filename) => {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const baselineLocalFile = `baseline-local-${base}${ext}`;
      const baselineCicdFile = `baseline-cicd-${base}${ext}`;

      return {
        artifactName: filename,
        baselineLocalSize: await getFileSize(path.join(scenarioDir, baselineLocalFile)),
        baselineLocalUrl: baselineUrl(scenarioName, baselineLocalFile),
        baselineCicdSize: await getFileSize(path.join(scenarioDir, baselineCicdFile)),
        baselineCicdUrl: baselineUrl(scenarioName, baselineCicdFile),
        recordedSize: await getFileSize(path.join(scenarioDir, filename)),
        recordedPath: `./${scenarioName}/${filename}`,
      };
    })
  );
}

async function main() {
  const entries = await fs.readdir(SCENARIOS_DIR, { withFileTypes: true });

  const scenarios: ScenarioData[] = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        const artifacts = await discoverArtifacts(
          path.join(SCENARIOS_DIR, e.name),
          e.name
        );
        return {
          name: e.name,
          artifacts,
          artifactCount: artifacts.length,
        };
      })
  );

  const templateSrc = await fs.readFile(TEMPLATE_PATH, "utf-8");
  const template = Handlebars.compile(templateSrc);
  const html = template({ scenarios });

  await fs.writeFile(path.join(SCENARIOS_DIR, "index.html"), html);
  console.log("Generated index.html");
}

main().catch(console.error);
