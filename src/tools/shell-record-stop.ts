import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { renderGif } from "../lib/render-gif.js";
import { ToolContext } from "./types.js";

export const shellRecordStopSchema = {
  session_id: z.string().describe("Session ID"),
  name: z.string().optional().describe("Recording name (default: recording_{timestamp})"),
};

export async function shellRecordStop(
  params: { session_id: string; name?: string },
  context: ToolContext
) {
  const { session_id, name } = params;
  const session = context.sessions.get(session_id);
  if (!session) {
    throw new Error(`Session not found: ${session_id}`);
  }

  if (!session.recording) {
    throw new Error(`Session ${session_id} is not recording`);
  }

  clearInterval(session.recording.interval);
  const { framesDir, frameCount, fps, startTime } = session.recording;
  const durationMs = Date.now() - startTime;

  const filename = `${name || `recording_${Date.now()}`}.gif`;
  const sessionDir = context.getSessionDir(context.getMcpSessionId(), session_id);
  const recordingsDir = path.join(sessionDir, "recordings");
  const filePath = path.join(recordingsDir, filename);

  await fs.mkdir(recordingsDir, { recursive: true });

  const result = await renderGif(framesDir, filePath, { fps });

  // Cleanup frames (keep the GIF for diagnostics)
  await fs.rm(framesDir, { recursive: true, force: true });
  session.recording = undefined;

  const originalFrames = frameCount;
  context.log(`[shellwright] Recording saved: ${filePath} (${result.frameCount}/${originalFrames} frames, ${result.duplicatesSkipped} deduplicated, ${durationMs}ms)`);

  const downloadUrl = context.getDownloadUrl(context.getMcpSessionId(), session_id, "recordings", filename);
  const output = {
    filename,
    download_url: downloadUrl,
    frame_count: result.frameCount,
    duration_ms: durationMs,
    hint: "Use curl -o <filename> <download_url> to save the file"
  };
  context.logToolCall("shell_record_stop", { session_id, name }, output);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}
