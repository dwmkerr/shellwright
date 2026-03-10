# Architecture

## Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Server                              │
│  shell_start | shell_send | shell_read | shell_screenshot | ... │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Session                                │
│  ┌───────────┐    ┌─────────────┐    ┌───────────────────────┐  │
│  │  node-pty │───▶│   xterm     │───▶│   Recording (opt)     │  │
│  │           │    │  (headless) │    │   frames[] + interval │  │
│  └───────────┘    └──────┬──────┘    └───────────────────────┘  │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Render Pipeline                            │
│     xterm buffer ──▶ SVG ──▶ PNG ──▶ GIF                        │
│                   (buffer-   (resvg)  (gifski)                  │
│                    to-svg)                                      │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      HTTP File Server                           │
│     GET /files/{path} ──▶ serves screenshots & recordings       │
│     (runs on same port for HTTP mode, separate for stdio)       │
└─────────────────────────────────────────────────────────────────┘
```

## File Download Flow

Screenshots and recordings return format-specific download URLs instead of base64 data:

```
1. LLM calls shell_screenshot() or shell_record_stop()
2. Server saves file to temp directory
3. Server returns: { filename, download_png_url, download_svg_url, ... } or { filename, download_gif_url, ... }
4. LLM uses curl to download: curl -o file.png <download_png_url>
```

This avoids token overflow from large base64 payloads.

## Data Flow

```
User input ──▶ pty.write() ──▶ shell process
                                    │
                                    ▼
              terminal.write() ◀── pty.onData()
                    │
                    ▼
              xterm buffer ──▶ snapshot (text)
                    │
                    └─────────▶ screenshot (SVG/PNG)
                                    │
                                    └─▶ recording (frame sequence ──▶ GIF)
                                              │
                                              ▼
                                    HTTP file server ──▶ curl download
```
