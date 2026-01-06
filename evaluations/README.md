# Evaluations

Automated recording evaluations using Claude API with shellwright.

## Usage

### Run evaluations locally

```bash
# Requires ANTHROPIC_API_KEY
npm run eval
```

### Generate comparison table

```bash
npm run eval:compare
```

## Adding a new scenario

1. Create a folder in `scenarios/`
2. Add a `prompt.md` with instructions for Claude
3. Run evaluations to generate the recording

## CI Integration

The `recording-eval.yaml` workflow runs on every PR:
1. Executes all scenarios
2. Generates comparison table
3. Uploads recordings as artifacts
4. Posts summary to PR
