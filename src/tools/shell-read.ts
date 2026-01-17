import { z } from "zod";
import { ToolContext } from "./types.js";

// Basic ANSI stripping (incomplete - see 04-findings.md for why this is insufficient)
function stripAnsi(str: string): string {
  return str
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")  // CSI sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")  // OSC sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, "")  // DCS/SOS/PM/APC
    // eslint-disable-next-line no-control-regex, no-useless-escape
    .replace(/\x1b[\(\)][AB0-2]/g, "")  // Character set selection
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[=>NOM78]/g, "")  // Other escape sequences
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");  // Control chars
}

export const shellReadSchema = {
  session_id: z.string().describe("Session ID"),
  raw: z.boolean().optional().describe("Return raw ANSI codes (default: false)"),
};

export async function shellRead(
  params: { session_id: string; raw?: boolean },
  context: ToolContext
) {
  const { session_id, raw } = params;
  const session = context.sessions.get(session_id);
  if (!session) {
    throw new Error(`Session not found: ${session_id}`);
  }

  let content = session.buffer.join("");
  if (!raw) {
    content = stripAnsi(content);
  }

  // Limit to last 8KB to avoid context overflow
  const maxSize = 8192;
  if (content.length > maxSize) {
    content = "...(truncated)...\n" + content.slice(-maxSize);
  }

  context.log(`[shellwright] Read ${content.length} chars from ${session_id}`);
  context.logToolCall("shell_read", { session_id, raw }, { length: content.length });

  return {
    content: [{ type: "text" as const, text: content }],
  };
}
