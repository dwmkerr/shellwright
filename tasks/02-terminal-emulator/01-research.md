# Terminal Emulator Research

## Key Discovery: `avt` (asciinema virtual terminal)

The [avt](https://github.com/asciinema/avt) crate is exactly what we need - a battle-tested terminal emulator used by:
- asciinema CLI
- asciinema player (compiled to WASM)
- asciinema server
- agg (GIF generator)

### avt API

```rust
// Create terminal
let mut vt = Vt::new(120, 40);

// Feed PTY output
vt.feed_str(pty_data);

// Get rendered screen as text
let lines: Vec<String> = vt.text();

// Get cursor position
let cursor = vt.cursor();  // (col, row)

// Iterate lines with styling
for line in vt.view() {
    for cell in line.cells() {
        let char = cell.char();
        let pen = cell.pen();  // colors, bold, etc.
    }
}
```

### Why avt Works

- Parses ANSI escape sequences (VT100/xterm compatible)
- Maintains virtual screen buffer (primary + alternate)
- Handles cursor positioning, colors, screen modes
- No rendering dependencies - pure parsing + state
- Apache 2.0 license

## Options for Node.js Integration

### Option A: avt via WASM (Recommended)

avt compiles to WebAssembly and is already used in asciinema-player for browser.

**Approach:**
1. Compile avt to WASM with wasm-pack
2. Generate JS bindings
3. Import in Node.js

**Pros:**
- Battle-tested terminal emulation
- Same code asciinema uses
- Fast (Rust + WASM)

**Cons:**
- Requires Rust toolchain for builds
- WASM module adds complexity

### Option B: asciinema .cast + agg

Use the asciinema ecosystem:
1. Record PTY output to `.cast` format (simple JSON)
2. Shell out to `agg` for rendering

**Cast format:**
```json
{"version": 2, "width": 120, "height": 40}
[0.0, "o", "output data"]
[0.5, "o", "more output"]
```

**Pros:**
- Proven format and tools
- External rendering (less code)
- Can generate GIF/PNG

**Cons:**
- External dependency (agg binary)
- Subprocess overhead
- No real-time screen state

### Option C: Port avt to TypeScript

Reimplement avt's core logic in TypeScript.

**Pros:**
- Native Node.js
- No build complexity

**Cons:**
- Significant effort
- Risk of missing edge cases
- Maintenance burden

### Option D: xterm.js Headless

Previous POC found this doesn't work - browser-only, ESM issues.

**Status:** ❌ Not viable

## Recommendation

**Start with Option B** (asciinema .cast + agg) for immediate results:
- Add timestamp capture to PTY buffer
- Export to .cast format
- Use agg for PNG/GIF rendering

**Explore Option A** (avt WASM) for real-time screen state:
- Investigate wasm-pack build
- Test in Node.js environment
- Could give us proper `shell_read` rendering

## asciicast v2 Format

Simple JSON-lines format:

```
{"version": 2, "width": 80, "height": 24, "timestamp": 1234567890}
[0.0, "o", "$ "]
[0.5, "o", "ls\r\n"]
[0.6, "o", "file1.txt  file2.txt\r\n"]
```

Event types:
- `"o"` - output (terminal display)
- `"i"` - input (user typing)
- `"m"` - marker/metadata

## References

- [avt GitHub](https://github.com/asciinema/avt) - Terminal emulator
- [agg GitHub](https://github.com/asciinema/agg) - GIF generator
- [asciinema docs](https://docs.asciinema.org/) - Format specs
- [VT100 state diagram](https://www.vt100.net/emu/dec_ansi_parser) - ANSI parser reference
