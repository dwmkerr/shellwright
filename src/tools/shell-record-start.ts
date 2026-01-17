import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { Resvg } from "@resvg/resvg-js";
import { bufferToSvg } from "../lib/buffer-to-svg.js";
import { ToolContext } from "./types.js";

export const shellRecordStartSchema = {
  session_id: z.string().describe("Session ID"),
  fps: z.number().optional().describe("Frames per second (default: 10, max: 30)"),
};

export async function shellRecordStart(
  params: { session_id: string; fps?: number },
  context: ToolContext
) {
  const { session_id, fps } = params;
  const session = context.sessions.get(session_id);
  if (!session) {
    throw new Error(`Session not found: ${session_id}`);
  }

  if (session.recording) {
    throw new Error(`Session ${session_id} is already recording`);
  }

  const recordingFps = Math.min(fps || 10, 30);
  const sessionDir = context.getSessionDir(context.getMcpSessionId(), session_id);
  const framesDir = path.join(sessionDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  session.recording = {
    startTime: Date.now(),
    framesDir,
    frameCount: 0,
    fps: recordingFps,
    interval: setInterval(async () => {
      if (!session.recording) return;

      const frameNum = session.recording.frameCount++;
      const svg = bufferToSvg(session.terminal, session.cols, session.rows, { 
        theme: session.theme, 
        fontSize: context.config.FONT_SIZE, 
        fontFamily: context.config.FONT_FAMILY 
      });
      const png = new Resvg(svg, context.resvgOptions).render().asPng();
      const framePath = path.join(framesDir, `frame${String(frameNum).padStart(6, "0")}.png`);
      await fs.writeFile(framePath, png);
    }, 1000 / recordingFps),
  };

  context.log(`[shellwright] Recording started: ${session_id} @ ${recordingFps} FPS → ${framesDir}`);

  const output = { recording: true, fps: recordingFps, frames_dir: framesDir };
  context.logToolCall("shell_record_start", { session_id, fps }, output);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}
