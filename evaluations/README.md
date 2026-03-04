# Evaluations

Automated recording and screenshot evaluations using Claude API with shellwright.

## Usage

### Run evaluations locally

```bash
# Requires ANTHROPIC_API_KEY
npm run eval

# Run a single scenario
npm run eval -- screenshot-border
```

### Generate comparison table

```bash
npm run eval:compare
open scenarios/index.html
```

## Adding a new scenario

1. Create a folder in `scenarios/`
2. Add a `prompt.md` with instructions for Claude
3. Run evaluations to generate artifacts (GIFs, PNGs)

## Baselines

Baselines are reference artifacts committed to the repo for visual comparison. Each artifact `<name>.<ext>` can have two baselines:

| File | Source |
|------|--------|
| `baseline-local-<name>.<ext>` | Developer machine |
| `baseline-cicd-<name>.<ext>` | CI environment |

### Updating baselines

**Local baseline:** Run the eval locally and copy the output:

```bash
npm run eval -- screenshot-border
cp scenarios/screenshot-border/screenshot.png scenarios/screenshot-border/baseline-local-screenshot.png
```

**CI/CD baseline:** Download the artifact from the PR preview and commit it:

```bash
curl -o scenarios/vim-session/baseline-cicd-recording.gif \
  https://dwmkerr.github.io/shellwright/pr-preview/pr-XX/vim-session/recording.gif
```

The comparison page auto-discovers baselines by scanning for `baseline-{local,cicd}-*` files matching each artifact.

## MCP tools available in scenarios

Scenario prompts instruct Claude to use these shellwright MCP tools:

| Tool | Description |
|------|-------------|
| `shell_start` | Start a new PTY session with a command |
| `shell_send` | Send input to a PTY session (use `\r` for Enter) |
| `shell_read` | Read the current terminal buffer as plain text |
| `shell_screenshot` | Capture terminal screenshot as PNG |
| `shell_record_start` | Start recording a terminal session (captures frames for GIF) |
| `shell_record_stop` | Stop recording and save GIF |
| `shell_stop` | Stop a PTY session |

### Key parameters

**`shell_start`** — `command`, `args`, `cols`, `rows`, `theme` (e.g., `one-dark`)

**`shell_send`** — `input` (with escape sequences: `\r`=Enter, `\x1b`=Escape, `\x03`=Ctrl+C)

**`shell_screenshot`** — `name` (without extension), `border: { style: "macos", title: "..." }`

**`shell_record_start`** — `fps` (default: 10, max: 30)

**`shell_record_stop`** — `name` (without extension, `.gif` added automatically)

### Artifact naming

Tools append extensions automatically — pass names **without** extensions:
- `name: "recording"` → `recording.gif`
- `name: "screenshot"` → `screenshot.png`

## CI Integration

The `recording-eval.yaml` workflow runs on every PR:
1. Executes all scenarios
2. Generates comparison table
3. Deploys to GitHub Pages as PR preview
4. Uploads GIF and PNG artifacts
