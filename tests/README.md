# Terminal Emulator Tests

Tests for the terminal emulator that processes PTY output into rendered screen state.

## Structure

```
tests/
├── run-tests.ts          # Test runner
├── 01-echo/
│   ├── input.cast        # Recorded PTY output (asciicast v2)
│   └── expected.txt      # Expected screen (80x24 grid)
```

## Test Format

### input.cast

asciicast v2 format (JSON lines):
```
{"version": 2, "width": 80, "height": 24}
[0.0, "o", "output text\r\n"]
[0.1, "o", "more output"]
```

### expected.txt

Full 80x24 terminal grid:
- Exactly 24 lines
- Each line padded to 80 characters
- Represents final screen state after processing all events

## Running Tests

```bash
npm run test:emulator
```

## Adding Tests

1. Create a new directory: `tests/NN-name/`
2. Add `input.cast` with recorded PTY bytes
3. Add `expected.txt` with 80x24 rendered output

To generate expected.txt with proper padding:
```python
lines = ["line1", "line2", ...]
while len(lines) < 24:
    lines.append("")
output = "\n".join(line.ljust(80) for line in lines)
```
