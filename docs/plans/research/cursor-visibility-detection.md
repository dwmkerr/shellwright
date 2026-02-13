# Research: Detecting Cursor Visibility State in xterm.js Headless

## Summary

Cursor visibility state (controlled by DECTCEM escape sequences) **is exposed** in the xterm.js headless public API through the `terminal.modes.showCursor` property.

## Implementation Details

### Internal State

The cursor visibility state is stored internally in the `CoreService`:

```typescript
// src/common/services/CoreService.ts
public isCursorHidden: boolean = false;
```

### DECTCEM Handling

The DECTCEM escape sequences are handled in the input handler:

- **Show Cursor** (`CSI ? 25 h`): Sets `isCursorHidden = false`
- **Hide Cursor** (`CSI ? 25 l`): Sets `isCursorHidden = true`

Source: `/tmp/xterm-research/src/common/InputHandler.ts` lines 2023 and 2269

### Public API Access

The cursor visibility state is exposed through the `modes` property:

```typescript
// From terminal.modes getter
{
  showCursor: !this._core.coreService.isCursorHidden,
  // ... other modes
}
```

Source: `/tmp/xterm-research/src/headless/public/Terminal.ts` line 121

### TypeScript Interface

The public type definition confirms this:

```typescript
export interface IModes {
  /**
   * Show Cursor (DECTCEM): `CSI ? 2 5 h`
   */
  readonly showCursor: boolean;
  // ... other modes
}
```

Source: `/tmp/xterm-research/typings/xterm-headless.d.ts` lines 1453-1455

## Usage in Shellwright

To detect if the cursor is visible in a headless xterm.js instance:

```typescript
import { Terminal } from '@xterm/headless';

const term = new Terminal();

// Check cursor visibility at any time
const isCursorVisible = term.modes.showCursor;

// Example: cursor becomes hidden after CSI ? 25 l
term.write('\x1b[?25l'); // Hide cursor
console.log(term.modes.showCursor); // false

term.write('\x1b[?25h'); // Show cursor
console.log(term.modes.showCursor); // true
```

## Additional Evidence

1. **GitHub Issue**: The [xterm-addon-serialize ignores cursor visibility issue](https://github.com/xtermjs/xterm.js/issues/3364) confirms that while cursor visibility state exists, it's not preserved during serialization
2. **Test Coverage**: Tests in `InputHandler.test.ts` verify the cursor visibility reset behavior
3. **DECTCEM Support**: xterm.js fully supports DECTCEM (documented in VT features)

## Recommendation

Use `terminal.modes.showCursor` to detect cursor visibility state. This is:
- Part of the stable public API
- A readonly property that reflects internal state
- Updated synchronously when escape sequences are processed
- Available in both browser and headless versions of xterm.js

## Sources

- [xterm-addon-serialize ignores cursor visibility - Issue #3364](https://github.com/xtermjs/xterm.js/issues/3364)
- [Supported Terminal Sequences - xterm.js](https://xtermjs.org/docs/api/vtfeatures/)
- [ITerminalOptions - xterm.js API](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/)
- xterm.js repository cloned to `/tmp/xterm-research` and examined
