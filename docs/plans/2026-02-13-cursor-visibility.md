# Cursor Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render terminal cursor in screenshots and recordings when visible.

**Architecture:** Add cursor rendering as post-pass in `bufferToSvg`. Check `terminal.modes.showCursor`, render block cursor with inverted colors at cursor position.

**Tech Stack:** TypeScript, xterm.js headless, SVG generation

---

### Task 1: Add cursor rendering to bufferToSvg

**Files:**
- Modify: `src/lib/buffer-to-svg.ts:159` (after main rendering loop)

**Step 1: Write the cursor rendering code**

Add after line 159 (after the main `for` loop ends, before the `return` statement):

```typescript
  // Render cursor if visible
  if (terminal.modes.showCursor) {
    const cursorX = buffer.cursorX;
    const cursorY = buffer.cursorY;

    // Only render if cursor is within visible area
    if (cursorX >= 0 && cursorX < cols && cursorY >= 0 && cursorY < rows) {
      const cursorXPos = padding + cursorX * charWidth;
      const cursorYPos = padding + cursorY * lineHeight;

      // Get the cell at cursor position for color inversion
      const cursorLine = buffer.getLine(cursorY);
      const cursorCell = cursorLine?.getCell(cursorX);

      // Cursor block uses foreground color
      const cursorBg = theme.foreground;
      // Text under cursor uses background color (inversion)
      const cursorFg = theme.background;

      // Draw cursor block
      lines.push(
        `<rect x="${cursorXPos}" y="${cursorYPos}" width="${charWidth}" height="${lineHeight}" fill="${cursorBg}"/>`
      );

      // Draw inverted character if present
      if (cursorCell) {
        const char = cursorCell.getChars();
        if (char && char.trim()) {
          const textYPos = cursorYPos + opts.fontSize;
          lines.push(
            `<text x="${cursorXPos}" y="${textYPos}" fill="${cursorFg}">${escapeXml(char)}</text>`
          );
        }
      }
    }
  }
```

**Step 2: Build to verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Manual test with a shell session**

Run shellwright, start a session, take a screenshot. Verify cursor appears as a block.

**Step 4: Commit**

```bash
git add src/lib/buffer-to-svg.ts
git commit -m "feat: render cursor in screenshots and recordings"
```

---

### Task 2: Create GitHub RFC issue for force show/hide cursor

**Step 1: Create the issue**

```bash
gh issue create --title "rfc: force show/hide cursor option" --body "$(cat <<'EOF'
## Context

Cursor rendering now respects terminal state automatically via `terminal.modes.showCursor`.

## Potential Enhancement

If users need explicit control to force cursor on/off regardless of terminal state, we could add a parameter:

```typescript
shell_screenshot({ session_id, showCursor?: 'auto' | 'show' | 'hide' })
```

- `auto` (default): respect terminal state
- `show`: always render cursor
- `hide`: never render cursor

## Use Cases

- Force show cursor in TUI apps that hide it
- Force hide cursor in shell sessions for cleaner screenshots

Please comment if you have a use case for this.
EOF
)"
```

**Step 2: Note the issue URL**

Record the issue URL for reference.

**Step 3: Commit reference (optional)**

If desired, add issue reference to design doc.

---

### Task 3: Update design doc with implementation details

**Files:**
- Modify: `docs/plans/2026-02-13-cursor-visibility-design.md`

**Step 1: Add API details to design doc**

Add under Implementation section:

```markdown
## API Used

- `terminal.modes.showCursor`: Boolean indicating cursor visibility (DECTCEM state)
- `terminal.buffer.active.cursorX/Y`: Cursor position
```

**Step 2: Commit**

```bash
git add docs/plans/2026-02-13-cursor-visibility-design.md
git commit -m "docs: add API details to cursor visibility design"
```
