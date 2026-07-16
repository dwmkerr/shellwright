// Adaptive driver: records a REAL interactive Claude Code session over the
// shellwright MCP server. Polls the terminal buffer and infers UI state
// (trust dialog, busy spinner, idle prompt) instead of fixed sleeps.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const serverUrl = process.argv[2] || 'http://localhost:7499/mcp';
const BUNDLE_DIR =
  '/Users/Dave_Kerr/repos/github/dwmkerr/agents-at-scale-ark/scratch/okf-demo/ark-okf-bundle';

const client = new Client({name: 'okf-claude-driver', version: '0.0.2'});
await client.connect(new StreamableHTTPClientTransport(new URL(serverUrl)));

let sessionId = null;
async function call(tool, args = {}) {
  if (sessionId && !args.session_id) args.session_id = sessionId;
  const result = await client.callTool({name: tool, arguments: args});
  const text = result.content?.map((c) => c.text).join('\n') || '';
  try {
    const parsed = JSON.parse(text);
    if (parsed.shell_session_id) sessionId = parsed.shell_session_id;
    return parsed;
  } catch {
    return text;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = async () => String(await call('shell_read'));
const send = (input, delay_ms = 200) => call('shell_send', {input, delay_ms});

// Claude Code shows "esc to interrupt" while working; treat its absence plus
// a stable buffer as "idle and finished responding".
async function waitIdle(label, {timeoutMs = 120000, stableFor = 3} = {}) {
  const start = Date.now();
  let prev = '';
  let stable = 0;
  while (Date.now() - start < timeoutMs) {
    await sleep(2000);
    const buf = await read();
    // Spinner shows a random gerund ("Churned/Cooked/... for NNs") - match the
    // shape, not the word list.
    const busy =
      buf.includes('esc to interrupt') ||
      buf.includes('esc to cancel') ||
      buf.includes('ctrl+c to interrupt') ||
      / for \d+s/.test(buf.slice(-500));
    if (!busy && buf === prev) {
      stable += 1;
      if (stable >= stableFor) {
        console.log(`[idle] ${label} after ${Math.round((Date.now() - start) / 1000)}s`);
        return buf;
      }
    } else {
      stable = 0;
    }
    prev = buf;
  }
  console.log(`[timeout] ${label} - continuing anyway`);
  return prev;
}

async function screenshot(name, title) {
  const r = await call('shell_screenshot', {name, border: {style: 'macos', title}});
  console.log(`[shot] ${r.filename}`);
}

// --- scenario ---
await call('shell_start', {command: 'bash', args: ['--noprofile', '--norc'], cols: 110, rows: 32});
await send(
  `unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_SSE_PORT; export PS1='$ ' && cd ${BUNDLE_DIR} && clear\r`,
  500
);
await call('shell_record_start', {
  fps: 10,
  border: {style: 'macos', title: 'A real Claude Code session over an exported Ark OKF bundle'},
});
await sleep(500);
await send('ls\r', 1000);
await sleep(1000);

await send('claude --model sonnet\r', 2000);

// Handle the first-run trust dialog if it appears, then wait for the input box.
let buf = '';
for (let i = 0; i < 20; i++) {
  await sleep(1500);
  buf = await read();
  if (/trust the files|Do you trust/i.test(buf)) {
    console.log('[ui] trust dialog - accepting');
    await send('\r', 500);
    continue;
  }
  if (/\? for shortcuts|>\s*$|Try "/m.test(buf)) break;
}
console.log('[ui] claude TUI ready');
await screenshot('07-claude-start', 'Claude Code (sonnet) starting in the bundle directory');

// Type a question once, submit, confirm the TUI went busy (re-sending only
// the Enter key if it did not), then wait for the response to finish.
async function ask(question, label) {
  await send(question, 1200);
  await sleep(2000);
  await send('\r', 500);
  let busySeen = false;
  const start = Date.now();
  while (Date.now() - start < 25000) {
    await sleep(1500);
    const buf = await read();
    if (/esc to interrupt| for \d+s/.test(buf)) {
      busySeen = true;
      break;
    }
    if (Date.now() - start > 6000) {
      console.log('[nudge] no busy marker - re-sending Enter');
      await send('\r', 500);
    }
  }
  console.log(`[busy=${busySeen}] ${label}`);
  await waitIdle(label, {timeoutMs: 120000});
  await sleep(3000);
}

const q1 =
  'Look at the OKF bundle in this directory. Which agents run in this Ark cluster and which model do they use? Be brief.';
await ask(q1, 'first answer');
await screenshot('09-answer-agents', 'Agents and model, read from the OKF bundle');

const q2 =
  'Which tools does the ark-operator agent have, and which MCP server serves them? Cite the files you used.';
await ask(q2, 'second answer');
await screenshot('10-answer-tools', 'Tool + MCP server graph traversed via markdown links');

await sleep(2000);
await send('/exit', 600);
await send('\r', 500);
await sleep(2500);
const gif = await call('shell_record_stop', {name: 'claude-live-okf'});
console.log(`[gif] ${gif.filename} frames=${gif.frame_count} duration=${gif.duration_ms}ms`);
await call('shell_stop');
await client.close();
