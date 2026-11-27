---
name: resolve-issue
description: Make a zero-shot first attempt at one or more Shellwright GitHub issues, ending in a pull request with before/after evidence (screenshots, recordings, timings or test output) from a `main` build and the branch build, or an issue comment explaining why not. Use when the user says "resolve issue #N", "resolve #N and #M in one PR", or "zero-shot this".
---

# Resolve an issue

A first attempt without a human in the loop: from an issue to a reviewable pull request in one pass. The maintainer reviews it, then merges, asks for changes or takes over. A clear pull request that fails honestly is worth more than a polished one that hides a guess.

Running this skill is the maintainer's go-ahead to push a fix branch, upload evidence to the `pr-assets` branch and open a pull request. Never push to `main`, never force-push, never merge. Branches start from `origin/main` and their pull requests target it.

The repository is public, and so are its issues, pull requests and `pr-assets`. Evidence comes from throwaway sessions (`bash --norc`, `nvim --clean`, `htop`, scripted output), never from a terminal that shows the maintainer's own prompt, paths, history or accounts.

## 1. Find the work

```bash
gh issue view <n> --repo dwmkerr/shellwright --json number,title,body,labels,comments
```

Use `--json`: plain `gh issue view` exits 1 on some accounts with `GraphQL: Projects (classic) is being deprecated`. Also check open pull requests for work already done on the issue (`gh pr list --repo dwmkerr/shellwright`): reuse a good piece of an open pull request rather than writing it again, and say which one in the Details.

When the maintainer asks for several issues in one pull request, fix them on one branch with one commit per issue, so each can be reverted alone. A fix with no issue gets one first (`gh issue create`), so the pull request can close it.

## 2. Decide whether to attempt it

Stop and comment on the issue instead of coding when any of these hold:

- It adds or changes an MCP tool or parameter in a way the issue doesn't settle. Tool schemas are the public API; issues labelled `rfc:` are open questions, not specs.
- It changes the default output of screenshots or recordings (theme, font, size, timing) for every user, and the issue doesn't ask for that.
- The fix is clearly bigger than about 10 files or 300 lines.
- You can't reproduce it.

The comment says what you found: where the code is, the likely cause, the options and which you'd pick. That is a good outcome, not a failure. Shape it like the pull request body (step 7).

## 3. Branch, build "before" and reproduce

The working tree must be clean apart from untracked files.

```bash
git fetch origin
git switch -c fix/<issue>-<short-slug> origin/main      # feat/ for features
npm ci && npm run build && npm test                     # the baseline must pass
```

Build `main` in its own worktree, so the before and after servers can run side by side on different ports and the before is never a half-edited tree:

```bash
git worktree add scratch/wt-before origin/main --detach
(cd scratch/wt-before && npm ci && npm run build)
```

`jest.config.cjs` ignores `scratch/`, so `npm test` doesn't also run the worktree's copy of the tests.

Pick the evidence that fits each issue:

| Issue type | Evidence |
| --- | --- |
| Anything visible in a screenshot or recording | Before/after PNG or GIF from `capture.mjs`, same script both sides |
| Performance | Before/after timings from `capture.mjs`, three runs of each timed step, same machine and server flags |
| Terminal protocol or parsing (escape sequences, replies, buffer contents) | A jest test that fails before and passes after, plus a screenshot when a program shows the symptom |
| Startup, CLI flags, HTTP server | A transcript of the commands with stderr and exit codes, before and after |
| Kitty or sixel graphics | Shellwright can't render them yet (#86); say so in Checks |

### capture.mjs

`capture.mjs` starts a build's server over HTTP, plays a script of MCP calls, saves screenshots, recordings and per-step timings, and stops the server. Write the script once to `scratch/resolve-<issue>/<name>.json` and use it for both sides:

```json
{
  "server": ["--font-size", "14", "--cols", "110", "--rows", "30"],
  "steps": [
    {"start": {"command": "bash", "args": ["--norc", "--noprofile"], "cols": 110, "rows": 30}},
    {"send": "nvim --clean\r", "delay_ms": 500},
    {"until": "NVIM v", "timeout": 15000},
    {"wait": 3000},
    {"repeat": 3, "steps": [{"screenshot": "nvim"}]},
    {"record_start": {"fps": 4}},
    {"send": ":qa!\r", "delay_ms": 300},
    {"record_stop": "quit"},
    {"stop": true}
  ]
}
```

```bash
S=.claude/skills/resolve-issue/capture.mjs
D=scratch/resolve-<issue>
node $S $D/<name>.json $D before --checkout scratch/wt-before --port 7601
node $S $D/<name>.json $D after --port 7602
```

Each run writes `<label>-<name>.png` and `.txt` per screenshot, `<label>-<name>.gif` per recording, and `<label>-<script>-timings.json` and `<label>-<script>-server.log`, so several scripts can share one folder. For three timing runs, rename the timings file after each run. `until` polls `shell_read` for text, `wait` is milliseconds, `send` is typed as given (`\r` is Enter, `\u001b` is Escape) and `repeat` suffixes names with `-1`, `-2`, .... The script exits non-zero if a step fails; read the server log when it does.

Use ports other than 7498, which a Shellwright MCP server in the maintainer's editor may hold. Keep everything identical between before and after: script, flags, terminal size, theme, font and machine. For timings, close heavy apps and note the machine (`sysctl -n machdep.cpu.brand_string`) in Checks.

Look at every screenshot and the last frame of every GIF (`ffmpeg -i before-x.gif -vf "select=eq(n\,N)" -frames:v 1 frame.png`). The before must show the problem to someone glancing at it. If it doesn't, you haven't reproduced it.

## 4. Make the change

- Follow `CLAUDE.md` and the code around the change. Comments explain why, never what changed.
- Changes to a tool's schema, parameters or description go in `README.md` too.
- Add or update a test that fails before the fix where there's a seam for one. Tests are jest, beside the code (`src/**/*.test.ts`); `src/tools/high-throughput-read.test.ts` shows how to drive a real PTY session.
- To show a new test fails before the fix, stash only the source change: `git stash push <src files>`, `npm test`, `git stash pop`. Put the failing count in Checks.
- Run `npm run build`, `npm run lint` and `npm test`, and check each exit code, not just the tail.

## 5. Capture "after"

Rebuild (`npm run build`) and run `capture.mjs` with the same script and the label `after`. Compare each pair. If the after doesn't show the fix, keep working or say so in the pull request.

## 6. Upload the evidence

Images go on the `pr-assets` branch, which shares no history with `main`, one folder per issue (`87-88` for a combined run). If the branch doesn't exist yet, create it as an orphan with one README commit through the API:

```bash
R=dwmkerr/shellwright
if ! gh api repos/$R/branches/pr-assets --silent 2>/dev/null; then
  blob=$(gh api repos/$R/git/blobs -f encoding=utf-8 -f content="Evidence for pull requests. No shared history with main." --jq .sha)
  tree=$(gh api repos/$R/git/trees -f "tree[][path]=README.md" -f "tree[][mode]=100644" -f "tree[][type]=blob" -f "tree[][sha]=$blob" --jq .sha)
  commit=$(gh api repos/$R/git/commits -f message="chore: start pr-assets" -f tree=$tree --jq .sha)
  gh api repos/$R/git/refs -f ref=refs/heads/pr-assets -f sha=$commit --jq .ref
fi
```

Then upload only the before and after files:

```bash
D=scratch/resolve-<issue>
for f in $D/before-*.png $D/after-*.png $D/before-*.gif $D/after-*.gif; do
  [ -f "$f" ] || continue
  base64 -i "$f" | tr -d '\n' > "$f.b64"
  gh api -X PUT "repos/dwmkerr/shellwright/contents/<issue>/$(basename "$f")" \
    -f message="chore: evidence for #<issue>" -f branch=pr-assets -F content=@"$f.b64" --jq .content.path
done
```

Each file's URL is `https://github.com/dwmkerr/shellwright/blob/pr-assets/<issue>/<file>?raw=true`. Re-uploading a path needs `-f sha=<blob sha>`, so prefer new names (`after-2.png`). Timings and transcripts go in the pull request body as text, not as files.

## 7. Open the pull request

The pull request title is a conventional commit: release-please builds the changelog and version from it. Use `fix:` when any fix is in it, `feat:` for a new capability.

```bash
git push -u origin HEAD
gh pr create --repo dwmkerr/shellwright --base main \
  --title "<conventional commit title>" --body-file scratch/resolve-<issue>/pr.md
```

Open it as a draft (`--draft`) when the fix is partial or something is unchecked.

The body leads with the key message: Summary, the before and after table, Checks, then "Still open" if a problem remains. Everything else (the traced code path, every run's timings, extra shots, long notes) goes in one collapsed `Details` block. The Zero-shot footer is last. Caption every cell in under ten words: what's wrong in the before, what's fixed in the after. Write plain prose with no em dashes or curly quotes; quoted output keeps its original characters.

````markdown
## Summary
- <what changed and why, one bullet per issue>

Closes #<issue>

## Before and after
| | Before | After |
| --- | --- | --- |
| <what> | <img src="https://github.com/dwmkerr/shellwright/blob/pr-assets/<issue>/before-<name>.png?raw=true" width="480"><br><what's wrong> | <img src="...after-<name>.png?raw=true" width="480"><br><what's fixed> |
| <timed step>, median of 3 | 2.3s<br><what's wrong> | 0.1s<br><what's fixed> |

## Checks
- `npm run build`, `npm run lint`, `npm test`: <results>; the new test fails before the fix (<n> failures)
- <machine and flags for timings; anything not checked and why>

<details><summary>Details</summary>

<traced code path, every run's timings, transcripts, other notes>

</details>

## Zero-shot
First attempt by the `resolve-issue` skill. Review it, then merge, ask for changes or take it over.
````

To change the body later: `gh api -X PATCH repos/dwmkerr/shellwright/pulls/<n> -F body=@scratch/resolve-<issue>/pr.md`.

Remove the before worktree when done: `git worktree remove scratch/wt-before`.

## 8. Report

Give the maintainer the pull request URL (or the issue comment URL if you stopped at step 2), the issues it closes, and anything you didn't check or weren't sure of.
