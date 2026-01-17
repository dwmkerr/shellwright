import { z } from "zod";
import { bufferToText } from "../lib/buffer-to-ansi.js";
import { ToolContext } from "./types.js";

// Interpret escape sequences in input strings (e.g., \r → carriage return)
function interpretEscapes(str: string): string {
  return str
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\x1b/g, "\x1b")
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export const shellSendSchema = {
  session_id: z.string().describe("Session ID"),
  input: z.string().describe("Input to send (supports escape sequences like \\x1b[A for arrow up)"),
  delay_ms: z.number().optional().describe("Milliseconds to wait after sending input before capturing 'bufferAfter' (default: 100). Increase for slow commands."),
};

export async function shellSend(
  params: { session_id: string; input: string; delay_ms?: number },
  context: ToolContext
) {
  const { session_id, input, delay_ms } = params;
  const session = context.sessions.get(session_id);
  if (!session) {
    throw new Error(`Session not found: ${session_id}`);
  }

  const bufferBefore = bufferToText(session.terminal, session.cols, session.rows);

  const interpreted = interpretEscapes(input);
  session.pty.write(interpreted);
  context.log(`[shellwright] Sent to ${session_id}: ${JSON.stringify(input)}`);

  await new Promise((resolve) => setTimeout(resolve, delay_ms || 100));

  const bufferAfter = bufferToText(session.terminal, session.cols, session.rows);

  const output = { success: true, bufferBefore, bufferAfter };
  context.logToolCall("shell_send", { session_id, input, delay_ms }, output);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}
