#!/usr/bin/env node
// Drive a Shellwright build through MCP over HTTP and save its evidence.
//
//   node .claude/skills/resolve-issue/capture.mjs <script.json> <out-dir> <label> [--checkout <dir>] [--port <n>]
//
// Starts `node <checkout>/dist/index.js --http --port <n>` (checkout defaults
// to the current directory), plays the steps, then stops the server. Running
// the same script against a `main` worktree and the branch gives a before and
// after that differ only by the code.
//
// Writes, in <out-dir>:
//   <label>-<name>.png / .txt   one per screenshot step (PNG plus the text buffer)
//   <label>-<name>.gif          one per record_stop step
//   <label>-<script>-timings.json  every step with its duration in milliseconds
//   <label>-<script>-server.log    the server's stderr
//
// The script file:
//
//   {
//     "server": ["--font-size", "14", "--cols", "110", "--rows", "30"],
//     "steps": [
//       {"start": {"command": "bash", "cols": 110, "rows": 30}},
//       {"send": "nvim --clean\r", "delay_ms": 500},
//       {"until": "NVIM v", "timeout": 10000},
//       {"wait": 1000},
//       {"screenshot": "nvim"},
//       {"repeat": 3, "steps": [{"screenshot": "idle"}]},
//       {"record_start": {"fps": 4}},
//       {"record_stop": "rec"},
//       {"stop": true}
//     ]
//   }
//
// Inside "repeat", screenshot and record names get a -1, -2, ... suffix. Every
// step is timed, which is the evidence for performance issues.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const [scriptPath, outDir, label] = process.argv.slice(2);
if (!scriptPath || !outDir || !label || label.startsWith("--")) {
  console.error("usage: capture.mjs <script.json> <out-dir> <label> [--checkout <dir>] [--port <n>]");
  process.exit(2);
}
const checkout = path.resolve(arg("--checkout", process.cwd()));
const port = Number(arg("--port", "7600"));
const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
// Named after the script too, so several scripts can share one out-dir.
const runName = `${label}-${path.basename(scriptPath, ".json")}`;
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(checkout, "dist", "index.js");
if (!fs.existsSync(entry)) {
  console.error(`${entry} not found: run npm ci && npm run build in ${checkout}`);
  process.exit(2);
}

// A temp dir per run keeps frames from one build out of the other's recordings.
// No leading dot: express sendFile refuses paths with dotfile segments.
const tempDir = fs.mkdtempSync(path.join(path.resolve(outDir), `${label}-tmp-`));
const serverLog = fs.createWriteStream(path.join(outDir, `${runName}-server.log`));
const server = spawn(
  process.execPath,
  [entry, "--http", "--port", String(port), "--temp-dir", tempDir, ...(script.server || [])],
  { stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let serverExit = null;
server.on("exit", (code) => { serverExit = code; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (result) => result.content?.[0]?.text ?? "";

async function connect() {
  const deadline = Date.now() + 20000;
  for (;;) {
    if (serverExit !== null) throw new Error(`server exited with ${serverExit}, see ${runName}-server.log`);
    try {
      const client = new Client({ name: "resolve-issue-capture", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`)));
      return client;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await sleep(250);
    }
  }
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const timings = [];
let client;
let sessionId;

async function call(tool, args) {
  const result = await client.callTool({ name: tool, arguments: args });
  if (result.isError) throw new Error(`${tool}: ${text(result)}`);
  return text(result);
}

async function run(steps, suffix = "") {
  for (const step of steps) {
    const started = Date.now();
    let what;
    if (step.repeat) {
      for (let i = 1; i <= step.repeat; i++) await run(step.steps, `${suffix}-${i}`);
      continue;
    } else if (step.start) {
      what = `start ${step.start.command}`;
      sessionId = JSON.parse(await call("shell_start", step.start)).shell_session_id;
    } else if (step.send !== undefined) {
      what = `send ${JSON.stringify(step.send)}`;
      await call("shell_send", { session_id: sessionId, input: step.send, delay_ms: step.delay_ms ?? 100 });
    } else if (step.until) {
      what = `until ${JSON.stringify(step.until)}`;
      const deadline = Date.now() + (step.timeout ?? 15000);
      while (!(await call("shell_read", { session_id: sessionId })).includes(step.until)) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${JSON.stringify(step.until)}`);
        await sleep(250);
      }
    } else if (step.wait) {
      what = `wait ${step.wait}`;
      await sleep(step.wait);
    } else if (step.screenshot) {
      const name = `${step.screenshot}${suffix}`;
      what = `screenshot ${name}`;
      const out = JSON.parse(await call("shell_screenshot", { session_id: sessionId, name, border: step.border }));
      await download(out.download_png_url, path.join(outDir, `${label}-${name}.png`));
      await download(out.download_png_url.replace(/\.png$/, ".txt"), path.join(outDir, `${label}-${name}.txt`));
    } else if (step.record_start) {
      what = "record_start";
      await call("shell_record_start", { session_id: sessionId, ...step.record_start });
    } else if (step.record_stop) {
      const name = `${step.record_stop}${suffix}`;
      what = `record_stop ${name}`;
      const out = JSON.parse(await call("shell_record_stop", { session_id: sessionId, name }));
      await download(out.download_gif_url, path.join(outDir, `${label}-${name}.gif`));
      what += ` (${out.frame_count} frames over ${out.duration_ms}ms)`;
    } else if (step.stop) {
      what = "stop";
      await call("shell_stop", { session_id: sessionId });
    } else {
      throw new Error(`unknown step ${JSON.stringify(step)}`);
    }
    const ms = Date.now() - started;
    timings.push({ step: what, ms });
    console.log(`${String(ms).padStart(6)}ms  ${what}`);
  }
}

let failed = false;
try {
  client = await connect();
  await run(script.steps);
} catch (err) {
  failed = true;
  console.error(`capture failed: ${err.message}`);
} finally {
  fs.writeFileSync(path.join(outDir, `${runName}-timings.json`), JSON.stringify(timings, null, 2) + "\n");
  await client?.close().catch(() => {});
  server.kill("SIGINT");
  await sleep(300);
  fs.rmSync(tempDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
