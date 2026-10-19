# Changelog

## 1.1.0

### Added

- `web_research` 的 `includeContent` 参数：`false` 时只返回摘要/节选，降低上下文占用。
- 设置页显示引擎“最近错误”，方便区分反爬、超时、Key 无效。
- 设置页增加数据流向提示：查询会发往已启用的搜索引擎/API 服务商。
- 免费引擎直连失败时，自动回退到 DSH 的 `ctx.web.fetch()`（可复用代理与安全校验）。

### Changed

- README 增加“优势”“与原版 DSH 对比”“已知限制与应对”。
- 引擎失败状态通过 `web_engines` 输出，便于排查。

## 1.0.1

### Fixed

- `cordis.patch.yml` 同时固定 `web.fetchProvider: http`，修复 `deepseek-fetch-api` 与 `http` 同时可用导致的 `multiple usable web providers` 错误。

## 1.0.0

### Added

- 原生 `web_search` 多引擎搜索提供方：必应、百度、搜狗、360。
- 可选 Tavily、Exa、Firecrawl、Brave、Serper、DuckDuckGo、SearXNG。
- `web_research`、`web_collect`、`web_engines` 工具。
- 中文设置页、配置持久化、API Key 脱敏、试搜。
- 离线测试、真实网络冒烟测试、GitHub Actions CI。
