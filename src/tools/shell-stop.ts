import { z } from "zod";
import { ToolContext } from "./types.js";

export const shellStopSchema = {
  session_id: z.string().describe("Session ID"),
};

export async function shellStop(
  params: { session_id: string },
  context: ToolContext
) {
  const { session_id } = params;
  const session = context.sessions.get(session_id);
  if (!session) {
    throw new Error(`Session not found: ${session_id}`);
  }

  // Stop recording if active
  if (session.recording) {
    clearInterval(session.recording.interval);
  }

  session.pty.kill();
  context.sessions.delete(session_id);
  context.log(`[shellwright] Stopped session ${session_id}`);

  const output = { success: true };
  context.logToolCall("shell_stop", { session_id }, output);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}
