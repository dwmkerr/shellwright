# Shellwright MCP Server

Playwright for the shell. An MCP server that lets AI agents record, capture, and automate terminal sessions.

> **Work in Progress** - This project is under active development.

## Use Cases

- Create terminal recordings for documentation
- Capture terminal screenshots for PRs
- Automate TUI applications (k9s, htop, vim)
- Generate step-by-step terminal demos

## Getting Started

```bash
npm install
npm run dev
```

The server runs at `http://localhost:7498/mcp`.

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect to `http://localhost:7498/mcp` and explore the available tools.

### Run Example

```bash
cd examples
cp .env.sample .env
# Edit .env with your OpenAI API key
python k9s-demo.py
```

## TODO

- Set screen size tool

## License

MIT
