import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "fs";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const transport = new StdioClientTransport({
  command: "node",
  args: [process.env.SHELLWRIGHT_ROOT + "/dist/index.js"]
});
const client = new Client({ name: "hero-recorder", version: "1.0" });
await client.connect(transport);

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  return JSON.parse(result.content[0].text);
}

const session = await call("shell_start", { command: "bash", args: ["--norc", "--noprofile"], cols: 80, rows: 20, theme: "one-dark" });
const sid = session.shell_session_id;

// Clean prompt and reset terminal
await call("shell_send", { session_id: sid, input: "export PS1='$ '\r", delay_ms: 300 });
await call("shell_send", { session_id: sid, input: "printf '\\033c'\r", delay_ms: 500 });
await sleep(500);

// Start recording after clean screen
await call("shell_record_start", { session_id: sid, fps: 10, border: { style: "macos", title: "Shellwright" } });
await sleep(2000);

// Open vim with markdown file
await call("shell_send", { session_id: sid, input: "vim demo.md\r", delay_ms: 2500 });
await sleep(1500);

// Dismiss any plugin startup message (Enter)
let result = await call("shell_send", { session_id: sid, input: "\r", delay_ms: 1500 });
await sleep(500);

// Enter INSERT mode — check buffer to see if we're already in INSERT
result = await call("shell_send", { session_id: sid, input: "i", delay_ms: 1000 });
if (!result.bufferAfter.includes("INSERT")) {
  // First i was consumed by plugin, send again
  console.log("First i consumed by plugin, sending again...");
  result = await call("shell_send", { session_id: sid, input: "i", delay_ms: 1000 });
}
console.log("INSERT mode:", result.bufferAfter.includes("INSERT"));
await sleep(1000);

// Type markdown content with generous pacing
await call("shell_send", { session_id: sid, input: "# How to close Vim", delay_ms: 2000 });
await sleep(1200);
await call("shell_send", { session_id: sid, input: "\r\r", delay_ms: 1000 });
await call("shell_send", { session_id: sid, input: "1. Press **Escape**", delay_ms: 2000 });
await sleep(1000);
await call("shell_send", { session_id: sid, input: "\r", delay_ms: 1000 });
await call("shell_send", { session_id: sid, input: "2. Type `:q!` to quit without saving", delay_ms: 2000 });
await sleep(1000);
await call("shell_send", { session_id: sid, input: "\r", delay_ms: 1000 });
await call("shell_send", { session_id: sid, input: "3. Or type `:wq` to save and quit", delay_ms: 2000 });
await sleep(2500);

// Escape back to normal mode
await call("shell_send", { session_id: sid, input: "\x1b", delay_ms: 2000 });
await sleep(1500);

// Show :q! in command line
await call("shell_send", { session_id: sid, input: ":q!", delay_ms: 2000 });
await sleep(1500);

// Execute quit
await call("shell_send", { session_id: sid, input: "\r", delay_ms: 2000 });
await sleep(1500);

// Echo message
await call("shell_send", { session_id: sid, input: 'echo "This shell session was recorded by Shellwright!"\r', delay_ms: 2000 });
await sleep(3000);

// Stop and save
const recording = await call("shell_record_stop", { session_id: sid, name: "vim-close-v3" });
const response = await fetch(recording.download_url);
const buffer = await response.arrayBuffer();
const outPath = process.env.SHELLWRIGHT_ROOT + "/docs/examples/vim-close-v3.gif";
fs.writeFileSync(outPath, Buffer.from(buffer));
console.log(`\nSaved: ${outPath} (${(buffer.byteLength / 1024).toFixed(0)}KB, ${recording.frame_count} frames, ${(recording.duration_ms / 1000).toFixed(1)}s)`);

await call("shell_stop", { session_id: sid });
await client.close();
process.exit(0);
