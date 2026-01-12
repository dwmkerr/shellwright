# Changelog

## [0.1.8](https://github.com/dwmkerr/shellwright/compare/v0.1.7...v0.1.8) (2026-01-09)


### Features

* adaptive frame timing for GIF recordings ([#47](https://github.com/dwmkerr/shellwright/issues/47)) ([83712cf](https://github.com/dwmkerr/shellwright/commit/83712cf6327e99f9894756785e8adb7605864130))
* add recording evaluation workflow ([#43](https://github.com/dwmkerr/shellwright/issues/43)) ([94d2176](https://github.com/dwmkerr/shellwright/commit/94d21762ec354d94f9c7d518a8736014ba06ed35))
* improved README hero GIF with better pacing ([#39](https://github.com/dwmkerr/shellwright/issues/39)) ([2c14998](https://github.com/dwmkerr/shellwright/commit/2c14998aa490a2cc154061b80482ca53ecc0fee3))


### Bug Fixes

* use bash for shell sessions to avoid prompt issues ([#46](https://github.com/dwmkerr/shellwright/issues/46)) ([2154079](https://github.com/dwmkerr/shellwright/commit/2154079b1839f9a33a980496bfd09bb0f07ee0b9))

## [0.1.7](https://github.com/dwmkerr/shellwright/compare/v0.1.6...v0.1.7) (2026-01-05)


### Features

* add per-session theme selection via shell_start ([#35](https://github.com/dwmkerr/shellwright/issues/35)) ([4642364](https://github.com/dwmkerr/shellwright/commit/4642364952e17cf96d6cd7caed07cbf5f706763c))

## [0.1.6](https://github.com/dwmkerr/shellwright/compare/v0.1.5...v0.1.6) (2026-01-04)


### Miscellaneous Chores

* release 0.1.6 ([27854e6](https://github.com/dwmkerr/shellwright/commit/27854e66e47e5fe31bf67625c5f7cd4bcd3ce96d))

## [0.1.5](https://github.com/dwmkerr/shellwright/compare/v0.1.4...v0.1.5) (2026-01-04)


### Features

* improve LLM feedback with bufferBefore/bufferAfter and logging ([#23](https://github.com/dwmkerr/shellwright/issues/23)) ([4fee834](https://github.com/dwmkerr/shellwright/commit/4fee834ba3e8c78cdc6000c2ec8e9b9a236198c1))


### Bug Fixes

* pin node-pty to 1.0.0 to avoid spawn-helper permission bug ([#31](https://github.com/dwmkerr/shellwright/issues/31)) ([565f8e7](https://github.com/dwmkerr/shellwright/commit/565f8e722a929d1b1c36e5f56aad461bba985914))
* set MCP server path for Ark v0.1.49 compatibility ([c66a60b](https://github.com/dwmkerr/shellwright/commit/c66a60bcc451a3ec14ccc63e4f85879aac27a8e2))

## [0.1.4](https://github.com/dwmkerr/shellwright/compare/v0.1.3...v0.1.4) (2025-12-17)


### Features

* font size and family ([#14](https://github.com/dwmkerr/shellwright/issues/14)) ([5be7276](https://github.com/dwmkerr/shellwright/commit/5be7276c2b6e19c8a2e3dd3ecc96e6af92b2a513))
* return download_url for screenshots and recordings ([#19](https://github.com/dwmkerr/shellwright/issues/19)) ([2027c47](https://github.com/dwmkerr/shellwright/commit/2027c47b5b60785da48dfea8f4fa3d8e1268d7b4))

## [0.1.3](https://github.com/dwmkerr/shellwright/compare/v0.1.2...v0.1.3) (2025-12-17)


### Features

* improve screenshot quality and add multiple output formats ([#10](https://github.com/dwmkerr/shellwright/issues/10)) ([d3c1115](https://github.com/dwmkerr/shellwright/commit/d3c11153d18c8a3ce46895fb9303bbbfce54fb6e))

## [0.1.2](https://github.com/dwmkerr/shellwright-mcp-server/compare/v0.1.1...v0.1.2) (2025-12-16)


### Features

* basic theme support ([#8](https://github.com/dwmkerr/shellwright-mcp-server/issues/8)) ([4236c6f](https://github.com/dwmkerr/shellwright-mcp-server/commit/4236c6f050d47d036747f74039c5f594c4c23f6b))

## [0.1.1](https://github.com/dwmkerr/shellwright-mcp-server/compare/v0.1.0...v0.1.1) (2025-12-16)


### Bug Fixes

* skip prepare script during docker build ([#5](https://github.com/dwmkerr/shellwright-mcp-server/issues/5)) ([e030dd9](https://github.com/dwmkerr/shellwright-mcp-server/commit/e030dd9b8dbfbee29cdf45c4d65bc5959d59fa71))
* update typescript-eslint to address vulnerabilities ([#7](https://github.com/dwmkerr/shellwright-mcp-server/issues/7)) ([c188935](https://github.com/dwmkerr/shellwright-mcp-server/commit/c1889353d78eec6edbd43b703e7a00399839fe09))

## [0.1.0](https://github.com/dwmkerr/shellwright-mcp-server/compare/v0.1.0...v0.1.0) (2025-12-16)


### Features

* add custom SVG/PNG generation from xterm buffer ([33433d1](https://github.com/dwmkerr/shellwright-mcp-server/commit/33433d1810ed1ae86fb0e68120be018280c9fb30))
* add demo.py for natural language terminal control ([5082d0f](https://github.com/dwmkerr/shellwright-mcp-server/commit/5082d0fcd65a3c1802aee27e69601457f3979766))
* integrate @xterm/headless terminal emulator ([6aeea7b](https://github.com/dwmkerr/shellwright-mcp-server/commit/6aeea7bad48b4a2071afcfa6d1a61312b1ca9f3c))
* integrate xterm.js terminal emulator with PNG screenshots ([b84c580](https://github.com/dwmkerr/shellwright-mcp-server/commit/b84c5803252e136135216188e79267a9eaebcc6f))
* POC MCP server with PTY management ([8cc8704](https://github.com/dwmkerr/shellwright-mcp-server/commit/8cc870414e20321080daeab2e5963b99e8a89c12))
* video recording ([#3](https://github.com/dwmkerr/shellwright-mcp-server/issues/3)) ([ef4a2ca](https://github.com/dwmkerr/shellwright-mcp-server/commit/ef4a2ca12e5e73066ff4c958143a5b282098902c))


### Bug Fixes

* add security context and non-root user ([dd10ba8](https://github.com/dwmkerr/shellwright-mcp-server/commit/dd10ba84d684d6d366d91310f4102602807f5864))
* echo example takes screenshot like other examples ([34ceca0](https://github.com/dwmkerr/shellwright-mcp-server/commit/34ceca0461b0c5dbcd4cc22af6c4801e83bfa6da))
* simplify example output to just screenshot paths ([469dbf6](https://github.com/dwmkerr/shellwright-mcp-server/commit/469dbf699c301b74e26eeb9abb32a3a755f724cb))
* use screenshots folder for example output ([32da81a](https://github.com/dwmkerr/shellwright-mcp-server/commit/32da81a5ccad2fb1c34af9f00e11c9b5fec4dc05))


### Miscellaneous Chores

* release 0.1.0 ([af8a607](https://github.com/dwmkerr/shellwright-mcp-server/commit/af8a6071ce6bbad7852391f7e93c27cbe3ad1a6b))
