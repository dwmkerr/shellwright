# Terminal Emulator

## Problem

From POC findings: raw PTY output ≠ rendered screen. Simple ANSI stripping doesn't work for TUI apps like k9s. We need a terminal emulator that maintains screen state.

## Goal

Implement a headless terminal emulator that:
1. Accepts PTY output stream
2. Maintains virtual screen buffer (rows × cols)
3. Processes terminal control sequences (cursor, colors, screen modes)
4. Renders current screen state to clean text
5. Optionally renders to image formats

## Research Complete

See `01-research.md` for full details.

**Key Discovery:** [avt](https://github.com/asciinema/avt) (asciinema virtual terminal) is the battle-tested solution used by asciinema ecosystem. It compiles to WASM.

## Recommended Approach

### Phase 1: asciinema .cast format (Quick Win)
- Add timestamps to PTY buffer capture
- Export sessions to `.cast` format
- Use `agg` CLI for PNG/GIF rendering

### Phase 2: avt via WASM (Real-time rendering)
- Compile avt to WASM with wasm-pack
- Import in Node.js for real-time screen state
- Enables proper `shell_read` text rendering

## Options Evaluated

| Option | Status | Notes |
|--------|--------|-------|
| xterm.js headless | ❌ | Browser-only, doesn't work in Node.js |
| blessed | ❌ | TUI builder, not terminal emulator |
| avt via WASM | ✅ Recommended | Battle-tested, compiles to WASM |
| asciinema .cast + agg | ✅ Quick win | External tools, proven format |
| Custom parser | ⚠️ Fallback | Significant effort, edge cases |

## Next Steps

1. Implement .cast recording in session buffer
2. Add `shell_export` tool for .cast output
3. Test agg rendering
4. Explore avt WASM compilation
