/**
 * Terminal Emulator Test Runner
 *
 * Reads .cast files, processes through @xterm/headless,
 * compares output against expected.txt
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import xterm from "@xterm/headless";
const { Terminal } = xterm;

interface CastHeader {
  version: number;
  width: number;
  height: number;
  timestamp?: number;
}

type CastEvent = [number, string, string]; // [time, type, data]

interface TestCase {
  name: string;
  path: string;
  input: { header: CastHeader; events: CastEvent[] };
  expected: string;
}

function parseCast(content: string): { header: CastHeader; events: CastEvent[] } {
  const lines = content.trim().split("\n");
  const header = JSON.parse(lines[0]) as CastHeader;
  const events = lines.slice(1).map((line) => JSON.parse(line) as CastEvent);
  return { header, events };
}

function loadTestCases(testsDir: string): TestCase[] {
  const cases: TestCase[] = [];

  for (const entry of readdirSync(testsDir)) {
    const testPath = join(testsDir, entry);
    if (!statSync(testPath).isDirectory()) continue;

    const inputPath = join(testPath, "input.cast");
    const expectedPath = join(testPath, "expected.txt");

    try {
      const inputContent = readFileSync(inputPath, "utf-8");
      const expectedContent = readFileSync(expectedPath, "utf-8");

      cases.push({
        name: entry,
        path: testPath,
        input: parseCast(inputContent),
        expected: expectedContent,
      });
    } catch {
      console.error(`Skipping ${entry}: missing input.cast or expected.txt`);
    }
  }

  return cases;
}

async function renderScreen(
  header: CastHeader,
  events: CastEvent[]
): Promise<string> {
  const { width, height } = header;

  const terminal = new Terminal({
    cols: width,
    rows: height,
    allowProposedApi: true,
  });

  // Feed all events to terminal
  for (const [_time, type, data] of events) {
    if (type === "o") {
      await new Promise<void>((resolve) => terminal.write(data, resolve));
    }
  }

  // Render screen
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < height; i++) {
    const line = buffer.getLine(i);
    if (line) {
      lines.push(line.translateToString(true).padEnd(width));
    } else {
      lines.push("".padEnd(width));
    }
  }

  return lines.join("\n");
}

async function runTests() {
  const testsDir = new URL(".", import.meta.url).pathname;
  const testCases = loadTestCases(testsDir);

  console.log(`Found ${testCases.length} test case(s)\n`);

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const actual = await renderScreen(tc.input.header, tc.input.events);

    if (actual === tc.expected) {
      console.log(`✓ ${tc.name}`);
      passed++;
    } else {
      console.log(`✗ ${tc.name}`);
      console.log("  Expected:");
      console.log(tc.expected.split("\n").slice(0, 5).map(l => `    |${l}|`).join("\n"));
      console.log("  Actual:");
      console.log(actual.split("\n").slice(0, 5).map(l => `    |${l}|`).join("\n"));
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
