import { z } from "zod";
import { bufferToFullText, drainTerminal } from "../lib/buffer-to-ansi.js";
import { ToolContext } from "./types.js";

export const shellReadSchema = {
  session_id: z.string().describe("Session ID"),
  raw: z.boolean().optional().describe("Return the raw output stream with ANSI codes instead of the parsed terminal contents (default: false)"),
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

  let content: string;
  if (raw) {
    content = session.buffer.join("");
  } else {
    // Serialize the parsed terminal model (same source as shell_screenshot) so the
    // two tools can never disagree; the raw chunk ring stays behind raw: true.
    await drainTerminal(session.terminal);
    content = bufferToFullText(session.terminal);
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
