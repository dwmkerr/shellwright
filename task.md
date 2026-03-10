# Task: Add macOS window border to screenshots

Add an optional `border` parameter to `shell_screenshot` that wraps terminal content in macOS-style window chrome (traffic lights, title bar, rounded corners, drop shadow).

## Context

Screenshots are rendered via: terminal buffer → SVG (`src/lib/buffer-to-svg.ts`) → PNG (resvg). The SVG generation already supports themes, font size, and font family options. This feature adds window decorations as SVG elements wrapping the existing content.

## Changes

### 1. Extend `SvgOptions` in `src/lib/buffer-to-svg.ts`

Add border config to the options interface:

```typescript
interface SvgOptions {
  fontSize?: number;
  fontFamily?: string;
  theme?: Theme;
  border?: {
    style?: 'macos';
    title?: string;
  };
}
```

### 2. Update SVG generation in `src/lib/buffer-to-svg.ts`

When `border.style === 'macos'`:

- Add 28px to total height for title bar
- Add 12px horizontal padding each side
- Wrap existing content in `<g transform="translate(12, 28)">`
- Add before content:
  - `<defs>` with `<feDropShadow>` filter (dx=0, dy=4, stdDeviation=6, opacity=0.3)
  - Outer `<g filter="url(#shadow)">`
  - Background `<rect>` with rx=8, ry=8, full dimensions
  - Title bar `<rect>` (top 28px, slightly darker fill)
  - Traffic lights: 3 `<circle>` at x=12,32,52 y=14 r=6 fills #ff5f56, #ffbd2e, #27c93f
  - Optional title `<text>` centered in title bar
- Close wrapper groups after content

### 3. Pass `border` through tool params in `src/index.ts`

Update the `shell_screenshot` tool definition (~line 380):

- Add `border` to the zod schema (optional object with `style` enum and optional `title` string)
- Pass `border` to `bufferToSvg()` call (~line 400)

### 4. Update `shell_record_start` similarly (optional)

If recording GIFs should also support borders, pass the option through frame capture. Can skip for v1.

## Usage

```
# Without border (unchanged)
shell_screenshot session_id="..." name="screenshot"

# With macOS border
shell_screenshot session_id="..." name="screenshot" border={"style": "macos", "title": "Terminal"}
```

## Design notes

- No new dependencies — pure SVG elements, resvg handles them natively
- Non-breaking — border is optional, defaults to no border
- Traffic light colours: red #ff5f56, yellow #ffbd2e, green #27c93f
- Title bar background should be slightly darker than terminal background (e.g. #21252b for one-dark theme)
- Drop shadow gives depth, but keep it subtle
- 8px border radius for rounded corners matches macOS
