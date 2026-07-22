import xterm from "@xterm/headless";
const { Terminal } = xterm;
import { bufferToText, bufferToFullText, drainTerminal } from "./buffer-to-ansi.js";

describe("drainTerminal", () => {
  it("makes a queued write visible to bufferToText", async () => {
    const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    try {
      terminal.write("hello drain barrier");
      await drainTerminal(terminal);
      expect(bufferToText(terminal, 80, 24)).toContain("hello drain barrier");
    } finally {
      terminal.dispose();
    }
  });

  it("acts as a barrier: all writes queued before the drain are parsed", async () => {
    const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    try {
      for (let i = 0; i < 100; i++) {
        terminal.write(`line-${i}\r\n`);
      }
      terminal.write("FINAL_MARKER");
      await drainTerminal(terminal);

      const text = bufferToFullText(terminal);
      expect(text).toContain("line-0");
      expect(text).toContain("line-99");
      expect(text).toContain("FINAL_MARKER");
    } finally {
      terminal.dispose();
    }
  });
});

describe("bufferToFullText", () => {
  it("includes scrollback lines that have left the viewport", async () => {
    const terminal = new Terminal({ cols: 80, rows: 5, allowProposedApi: true });
    try {
      for (let i = 0; i < 20; i++) {
        terminal.write(`scroll-${i}\r\n`);
      }
      await drainTerminal(terminal);

      const text = bufferToFullText(terminal);
      expect(text).toContain("scroll-0");
      expect(text).toContain("scroll-19");
    } finally {
      terminal.dispose();
    }
  });
});
