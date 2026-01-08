# CLAUDE.md

## Project Overview

Shellwright is an MCP server providing "Playwright for the shell" - enabling AI agents to record, capture, and automate terminal sessions.

**Status:** Work in progress. See `tasks/01-poc/04-findings.md` for current state.

## Project Structure

```
shellwright/
├── src/                    # TypeScript source code
│   └── index.ts           # MCP server entry point
├── examples/              # Demo scripts
├── tasks/                 # Feature planning and tracking
└── dist/                  # Compiled output
```

## Build Commands

```bash
npm install       # Install dependencies
npm run build     # Build TypeScript
npm run dev       # Development with hot-reload
```

## Architecture

- **TypeScript + ESM** - Modern Node.js with ES modules
- **MCP SDK** - Uses `@modelcontextprotocol/sdk` for MCP protocol
- **PTY** - Uses `node-pty` for pseudo-terminal management
- **File Server** - HTTP file server runs on port 7498 regardless of MCP transport mode (stdio or HTTP). Tool results include `download_url` which is always valid.

## Commit Format

Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`

## PR Format

```markdown
## Summary
- Brief description of changes
```
