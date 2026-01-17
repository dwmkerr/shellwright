import * as pty from "node-pty";
import type xterm from "@xterm/headless";
import { Theme } from "../lib/themes.js";

export interface RecordingState {
  startTime: number;
  framesDir: string;
  frameCount: number;
  interval: ReturnType<typeof setInterval>;
  fps: number;
}

export interface Session {
  id: string;
  pty: pty.IPty;
  cols: number;
  rows: number;
  buffer: string[];
  terminal: InstanceType<typeof xterm.Terminal>;
  theme: Theme;
  recording?: RecordingState;
}

import { ResvgRenderOptions } from "@resvg/resvg-js";

export interface ToolContext {
  sessions: Map<string, Session>;
  getMcpSessionId: () => string | undefined;
  getSessionDir: (mcpSessionId: string | undefined, shellSessionId: string) => string;
  getDownloadUrl: (mcpSessionId: string | undefined, shellSessionId: string, type: "screenshots" | "recordings", filename: string) => string;
  log: (message: string) => void;
  logToolCall: (tool: string, input: Record<string, unknown>, output: Record<string, unknown>) => void;
  config: {
    PORT: number;
    FONT_SIZE: number;
    FONT_FAMILY: string;
    COLS: number;
    ROWS: number;
  };
  resvgOptions: ResvgRenderOptions;
}
