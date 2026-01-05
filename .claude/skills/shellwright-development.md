---
name: shellwright-development
description: Development workflows for Shellwright including themes, screenshots, and scripts
---

# Shellwright Development Skill

Development workflows and scripts for the Shellwright MCP server.

## Theme Development

Themes define terminal color palettes for screenshots and recordings.

### Theme Structure

Themes are defined in `src/lib/themes.ts`:

```typescript
export interface Theme {
  name: string;                    // e.g., "one-dark"
  type: "dark" | "light";
  description: string;
  tip?: string;
  ansiColors: [/* 16 ANSI colors */];
  background: string;              // Terminal background
  foreground: string;              // Default text color
}
```

### Adding a New Theme

1. Add theme definition to `src/lib/themes.ts`
2. Export in the `themes` record
3. Regenerate screenshots: `npx tsx scripts/generate-theme-screenshots.ts`
4. Regenerate demo GIF: `./scripts/theme-demo.sh`

### Color Mapping

xterm's `getFgColor()`/`getBgColor()` returns:
- `-1` for default (no explicit color)
- `0-255` for palette colors (0=black, 1=red, 2=green, etc.)
- `>255` for RGB colors (raw RGB value)

The `colorToHex()` function in `src/lib/buffer-to-svg.ts` handles this mapping.

## Scripts

### generate-theme-screenshots.ts

Generates SVG screenshots for each theme with embedded labels.

```bash
npx tsx scripts/generate-theme-screenshots.ts
```

Output: `docs/themes/{theme-name}.svg`

Features:
- Colorful terminal output with ANSI codes
- Theme name label at bottom (26pt monospace, white/black)
- Uses xterm headless for buffer rendering

### theme-demo.sh

Generates a cycling GIF from theme SVGs.

```bash
./scripts/theme-demo.sh
```

Output: `docs/themes/themes-demo.gif`

Requirements:
- ImageMagick (`brew install imagemagick`)

Settings:
- 3 second delay per frame (`-delay 300`)
- 2x scale for clarity (`-scale 200%`)
- 200 DPI density

## README Hero GIF (vim-close)

The main README GIF demonstrates Shellwright by opening vim, writing instructions on how to close it, then closing it.

### Specifications

- **Output**: `docs/examples/vim-close-v2.gif`
- **Terminal**: 80x20, `one-dark` theme
- **Prompt**: `dwmkerr_simple` (clean, minimal prompt)
- **FPS**: 10

### Setup (before recording)

```bash
# Set alias to hide -u NONE from recording (avoids plugin popups like fzf-lua)
alias vi='vim -u NONE'

# Set simple prompt
set_ps1 dwmkerr_simple

# Clear screen
clear
```

### Recording Sequence

Execute these steps with ~1 second visible pause between each:

| Step | Input | Notes |
|------|-------|-------|
| 1 | `vi` | Show command at prompt |
| 2 | `\r` (Enter) | Execute, vim opens with welcome screen |
| 3 | `i` | Enter INSERT mode (visible in status) |
| 4 | `How to close Vim:` | First line of text |
| 5 | `\r\r1. Press Escape` | Blank line + instruction 1 |
| 6 | `\r2. Type :q! to quit without saving` | Instruction 2 |
| 7 | `\r3. Or type :wq to save and quit` | Instruction 3 |
| 8 | `\x1b` (Escape) | Exit INSERT mode, show NORMAL |
| 9 | `:q!` | Show command in command line (wait before executing) |
| 10 | `\r` (Enter) | Execute quit, return to shell |
| 11 | `echo "This shell session was run and recorded by Claude Code and Shellwright!"\r` | Dramatic ending |
| 12 | (wait 1s) | Let final output be visible |

### Timing Notes

**Important**: When recording interactively with an AI agent, wall-clock time between steps includes processing delays. For a clean ~15-20 second GIF:

- Execute all steps in rapid succession without waiting for confirmations
- Use `delay_ms` of ~1000ms per step for visible pacing
- Total recording should be ~15-20 seconds, not minutes

The `delay_ms` parameter controls visual pacing (time before capturing buffer), but the recording captures continuously at FPS rate from start to stop.

### Version History

- `vim-close-v1.gif` - Original version (kept for reference)
- `vim-close-v2.gif` - Current version, clean 16-second recording with proper pacing

## Build Commands

```bash
npm install       # Install dependencies
npm run build     # Build TypeScript
npm run dev       # Development with hot-reload
```

## Testing Changes

After modifying themes or screenshot generation:

1. Build: `npm run build`
2. Generate screenshots: `npx tsx scripts/generate-theme-screenshots.ts`
3. Generate GIF: `./scripts/theme-demo.sh`
4. Preview: `open docs/themes/themes-demo.gif`
