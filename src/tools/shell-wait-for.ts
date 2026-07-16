import { z } from "zod";
import { bufferToText } from "../lib/buffer-to-ansi.js";
import { ToolContext } from "./types.js";

export const shellWaitForSchema = {
  session_id: z.string().describe("Session ID"),
  pattern: z.string().optional().describe(
    "Regex the buffer must match before the wait completes (e.g. '\\\\$ $' for a shell prompt)"
  ),
  absent_pattern: z.string().optional().describe(
    "Regex the buffer must NOT match before the wait completes (e.g. 'esc to interrupt' while a TUI is busy)"
  ),
  stable_ms: z.number().optional().describe(
    "Buffer must additionally be unchanged for this long (default: 0 = no stability check). Use ~4000 for chat TUIs that stream output."
  ),
  timeout_ms: z.number().optional().describe("Give up after this long (default: 30000)"),
  poll_ms: z.number().optional().describe("Poll interval (default: 250)"),
};

export interface WaitForConditions {
  pattern?: string;
  absentPattern?: string;
}

// Exported for unit testing - a buffer satisfies the wait when the required
// pattern matches and the forbidden pattern does not.
export function bufferSatisfies(buffer: string, conditions: WaitForConditions): boolean {
  if (conditions.pattern && !new RegExp(conditions.pattern, "m").test(buffer)) {
    return false;
  }
  if (conditions.absentPattern && new RegExp(conditions.absentPattern, "m").test(buffer)) {
    return false;
  }
  return true;
}

export async function shellWaitFor(
  params: {
    session_id: string;
    pattern?: string;
    absent_pattern?: string;
    stable_ms?: number;
    timeout_ms?: number;
    poll_ms?: number;
  },
  context: ToolContext
) {
  const { session_id, pattern, absent_pattern } = params;
  const stableMs = params.stable_ms ?? 0;
  const timeoutMs = params.timeout_ms ?? 30000;
  const pollMs = params.poll_ms ?? 250;

  const session = context.sessions.get(session_id);
  if (!session) {
    throw new Error(`Session not found: ${session_id}`);
  }
  if (!pattern && !absent_pattern && !stableMs) {
    throw new Error("Provide at least one of: pattern, absent_pattern, stable_ms");
  }

  const start = Date.now();
  let previousBuffer: string | null = null;
  let stableSince: number | null = null;
  let buffer = "";
  let satisfied = false;

  while (Date.now() - start < timeoutMs) {
    buffer = bufferToText(session.terminal, session.cols, session.rows);

    const conditionsMet = bufferSatisfies(buffer, { pattern, absentPattern: absent_pattern });

    if (buffer === previousBuffer) {
      stableSince = stableSince ?? Date.now();
    } else {
      stableSince = null;
    }
    previousBuffer = buffer;

    const stableMet = stableMs === 0 || (stableSince !== null && Date.now() - stableSince >= stableMs);

    if (conditionsMet && stableMet) {
      satisfied = true;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  const waitedMs = Date.now() - start;
  const output = {
    satisfied,
    timed_out: !satisfied,
    waited_ms: waitedMs,
    buffer,
  };
  context.logToolCall(
    "shell_wait_for",
    { session_id, pattern, absent_pattern, stable_ms: stableMs, timeout_ms: timeoutMs },
    { satisfied, timed_out: !satisfied, waited_ms: waitedMs }
  );
  context.log(
    `[shellwright] wait_for ${session_id}: ${satisfied ? "satisfied" : "timed out"} after ${waitedMs}ms`
  );

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}
