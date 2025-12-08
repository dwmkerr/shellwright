# Terminal Emulator - Verifiable Prototype

## Checkpoint 1: 2025-12-08 - Test Harness

### Goal
Create a test harness that can verify terminal emulator output against expected screen state.

### Verification
```bash
npm run test:emulator
```

### Results
- Test runner reads `.cast` files (asciicast v2 format)
- Compares rendered output to `expected.txt` (80x24 grid)
- Naive renderer passes simple echo test

### Feedback
- Test format works: input.cast + expected.txt
- Naive renderer won't handle cursor movement, TUI apps
- Need real terminal emulator (avt WASM) for complex cases

### Next Steps
1. Add a test case that requires real terminal emulation (cursor movement)
2. Integrate avt WASM to replace naive renderer
3. Verify avt passes both simple and complex tests

---

## Checkpoint 2: TBD - First Emulator Iteration

### Goal
Integrate avt (or alternative) to pass cursor movement test.

### Verification
```bash
npm run test:emulator
```

### Results
(pending)

### Feedback
(pending)

### Next Steps
(pending)
