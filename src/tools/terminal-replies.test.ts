import { shellStart } from "./shell-start.js";
import { bufferToText, drainTerminal } from "../lib/buffer-to-ansi.js";
import { ToolContext, Session } from "./types.js";

function createToolContext(): ToolContext {
  return {
    sessions: new Map(),
    getMcpSessionId: () => undefined,
    getSessionDir: () => "/tmp/shellwright-test",
    getDownloadUrl: () => "",
    log: () => {},
    logToolCall: () => {},
    config: { PORT: 0, FONT_SIZE: 14, FONT_FAMILY: "monospace", COLS: 80, ROWS: 24 },
    renderPng: () => Buffer.alloc(0),
  };
}

async function waitForText(session: Session, pattern: RegExp, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await drainTerminal(session.terminal);
    const text = bufferToText(session.terminal, session.cols, session.rows);
    if (pattern.test(text) || Date.now() > deadline) return text;
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("terminal replies reach the program that asked", () => {
  const context = createToolContext();
  let session: Session;

  afterAll(() => {
    session?.pty.kill();
    session?.terminal.dispose();
  });

  it("answers a cursor position query (DSR, CSI 6n)", async () => {
    // The program asks where the cursor is and waits up to 2s for the reply
    // ESC [ row ; col R, as Neovim, fzf and others do at startup
    const script = `printf 'ASK\\033[6n'; if IFS= read -rs -d R -t 2 reply; then echo "REPLY=\${reply#*[}"; else echo NO_REPLY; fi`;
    const result = await shellStart({ command: "bash", args: ["--norc", "--noprofile", "-c", script], cols: 80, rows: 24 }, context);
    const { shell_session_id } = JSON.parse(result.content[0].text);
    session = context.sessions.get(shell_session_id)!;

    const text = await waitForText(session, /REPLY=|NO_REPLY/, 5000);
    expect(text).toMatch(/REPLY=1;4\b/);
  }, 10000);
});
