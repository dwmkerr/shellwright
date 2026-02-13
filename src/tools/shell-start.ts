import { z } from "zod";
import * as pty from "node-pty";
import { randomUUID } from "crypto";
import xterm from "@xterm/headless";
const { Terminal } = xterm;
import { getTheme, getThemesByType, DEFAULT_THEME, themes } from "../lib/themes.js";
import { ToolContext, Session } from "./types.js";

// Build a clean env for PTY sessions - removes vars that could cause terminal interference
function getPtyEnv(): { [key: string]: string } {
  const env = { ...process.env } as { [key: string]: string };
  // Remove terminal-related vars that could cause the PTY to interact with parent terminal
  delete env.TERM_PROGRAM;
  delete env.TERM_PROGRAM_VERSION;
  delete env.TERM_SESSION_ID;
  delete env.ITERM_SESSION_ID;
  delete env.ITERM_PROFILE;
  delete env.TMUX;
  delete env.TMUX_PANE;
  delete env.STY;  // screen
  delete env.WINDOW;
  // Set terminal type and color support
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return env;
}

export const shellStartSchema = {
  command: z.string().describe(
    "Command to run. Examples: 'bash', 'zsh', 'k9s', 'htop', 'vim'. " +
    "For interactive shell sessions that should match the user's normal terminal " +
    "(custom prompt, colors, aliases, PATH), use 'bash' or 'zsh' with args ['--login', '-i']. " +
    "For standalone TUI programs like k9s, htop, or vim, run the command directly without shell flags."
  ),
  args: z.array(z.string()).optional().describe(
    "Command arguments. For interactive shells (bash, zsh), use ['--login', '-i'] to source " +
    "the user's shell configuration (~/.bashrc, ~/.zshrc) which provides their custom prompt, " +
    "aliases, functions, and environment variables. Without these flags, shells start with a " +
    "minimal environment and basic prompt. Not needed for standalone programs like k9s or htop."
  ),
  cols: z.number().optional().describe(`Terminal columns`),
  rows: z.number().optional().describe(`Terminal rows`),
  theme: z.string().optional().describe(
    (() => {
      const { dark, light } = getThemesByType();
      return `Color theme for screenshots and recordings. ` +
        `Dark themes: ${dark.join(", ")}. Light themes: ${light.join(", ")}. ` +
        `Default: ${DEFAULT_THEME}. ` +
        Object.values(themes).map(t => `'${t.name}': ${t.description}`).join(". ") + ".";
    })()
  ),
};

export async function shellStart(
  params: { command: string; args?: string[]; cols?: number; rows?: number; theme?: string },
  context: ToolContext
) {
  const { command, args, cols, rows, theme } = params;
  const id = `shell-session-${randomUUID().slice(0, 6)}`;
  const termCols = cols || context.config.COLS;
  const termRows = rows || context.config.ROWS;
  const sessionTheme = theme ? getTheme(theme) : getTheme(DEFAULT_THEME);

  const ptyProcess = pty.spawn(command, args || [], {
    name: "xterm-256color",
    cols: termCols,
    rows: termRows,
    cwd: process.cwd(),
    env: getPtyEnv(),
  });

  const terminal = new Terminal({
    cols: termCols,
    rows: termRows,
    allowProposedApi: true,
  });

  const session: Session = {
    id,
    pty: ptyProcess,
    cols: termCols,
    rows: termRows,
    buffer: [],
    terminal,
    theme: sessionTheme,
  };

  ptyProcess.onData((data) => {
    session.buffer.push(data);
    if (session.buffer.length > 1000) {
      session.buffer.shift();
    }
    terminal.write(data);
  });

  context.sessions.set(id, session);
  context.log(`[shellwright] Started session ${id}: ${command} (theme: ${sessionTheme.name})`);

  const output = { shell_session_id: id, theme: sessionTheme.name };
  context.logToolCall("shell_start", { command, args, cols, rows, theme }, output);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}
