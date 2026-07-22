import { randomUUID } from "crypto";
import { shellStart } from "./shell-start.js";
import { shellRead } from "./shell-read.js";
import { bufferToText, drainTerminal } from "../lib/buffer-to-ansi.js";
import { bufferToSvg } from "../lib/buffer-to-svg.js";
import { ToolContext, Session } from "./types.js";

function createToolContext(): ToolContext {
  return {
    sessions: new Map(),
    getMcpSessionId: () => undefined,
    getSessionDir: () => "/tmp/shellwright-test",
    getDownloadUrl: () => "",
    log: () => {},
    logToolCall: () => {},
    config: {
      PORT: 0,
      FONT_SIZE: 14,
      FONT_FAMILY: "monospace",
      COLS: 80,
      ROWS: 24,
    },
    resvgOptions: {},
  };
}

function firstText(result: { content: { type: "text"; text: string }[] }): string {
  return result.content[0].text;
}

describe("reads stay live after a high-throughput output burst", () => {
  const context = createToolContext();
  let session: Session;

  afterAll(() => {
    if (session) {
      session.pty.kill();
      session.terminal.dispose();
    }
  });

  it("sees a sentinel printed after a \\r flood in every capture path", async () => {
    const startResult = await shellStart({ command: "bash", cols: 80, rows: 24 }, context);
    const { shell_session_id } = JSON.parse(firstText(startResult));
    session = context.sessions.get(shell_session_id)!;
    expect(session).toBeDefined();

    const rand = randomUUID().replace(/-/g, "").slice(0, 8);
    const sentinel = `SENTINEL_${rand}`;
    // The '' split stops the local echo of the typed command from containing the
    // sentinel, so only real command output can match the assertions below.
    session.pty.write(
      `for i in $(seq 1 20000); do printf '\\rline %d' "$i"; done; echo; echo SENTINEL_''${rand}\r`
    );

    // Wait for the shell to finish the flood and print the sentinel
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !session.buffer.join("").includes(sentinel)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(session.buffer.join("")).toContain(sentinel);

    // shell_read serializes the parsed terminal after draining the write queue
    const readResult = await shellRead({ session_id: shell_session_id }, context);
    expect(firstText(readResult)).toContain(sentinel);

    // The screenshot/send capture path: bufferToText after an explicit drain
    await drainTerminal(session.terminal);
    expect(bufferToText(session.terminal, session.cols, session.rows)).toContain(sentinel);

    // The recording frame path: bufferToSvg after the same drain. The SVG puts
    // each cell in its own <text> element on its own line, so strip markup and
    // whitespace before matching (the sentinel contains neither).
    const svg = bufferToSvg(session.terminal, session.cols, session.rows, {
      theme: session.theme,
      fontSize: 14,
      fontFamily: "monospace",
    });
    expect(svg.replace(/<[^>]*>/g, "").replace(/\s+/g, "")).toContain(sentinel);
  }, 30000);
});
