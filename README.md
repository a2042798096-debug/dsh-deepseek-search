# DeepSeek 搜索（dsh-deepseek-search）

[![CI](https://github.com/a2042798096-debug/dsh-deepseek-search/actions/workflows/ci.yml/badge.svg)](https://github.com/a2042798096-debug/dsh-deepseek-search/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

给 DeepSeek Harness 桌面端补上“真正能上网查资料”的能力：**多引擎搜索 + 网页正文抓取 + 一次调用完成深度收集**，并提供一个中文设置页。

仓库地址：<https://github.com/a2042798096-debug/dsh-deepseek-search>

- 原生 `web_search` 会自动切换到本插件的多引擎搜索链，模型不需要换工具名。
- 新增 `web_research`：搜索 → 选页 → 抓正文 → 汇总，带出处。
- 新增 `web_collect`：一次读多个 URL 的正文。
- 新增 `web_engines`：查看引擎启用/可用状态。
- 设置页可开关引擎、填 API Key、调超时与正文上限、直接试搜。

> 当前版本默认接入国内可直连的 **必应、百度、搜狗、360**；Tavily / Exa / Firecrawl / Brave / Serper 需要 Key，DuckDuckGo / SearXNG 默认关闭。在部分中国大陆网络中，Google、DuckDuckGo、Brave、SearXNG 公共实例可能连接超时，所以没有把它们设为默认。

---

## 1. 安装

先获取代码：

```powershell
git clone https://github.com/a2042798096-debug/dsh-deepseek-search.git
cd dsh-deepseek-search
```

### 方式 A：双击脚本（推荐）

1. **完全退出 DeepSeek Harness**（不是最小化到托盘，是退出进程）。
2. 双击本目录下的 `安装.cmd`，或在 PowerShell 中运行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
   ```

3. 脚本会把本目录以 `link:` 方式装进 `desktop` profile，并打印验证结果。
4. 重新启动 DeepSeek Harness。
5. 打开 **设置 → DeepSeek 搜索**，点一次“试搜”确认引擎可用。

### 方式 B：手动命令

```powershell
# 按你的实际路径修改这两行
$dsh = "D:\deepseekharness\resources\runtime\cli\bin\dsh.cmd"
$plugin = "C:\path\to\dsh-deepseek-search"
& $dsh plugin --profile desktop add "link:$($plugin -replace '\\','/')"
```

如果 DSH 安装路径不同，把 `$dsh` 换成实际安装目录（目录下应有 `resources\runtime\cli\bin\dsh.cmd`）。

安装完成后，profile 的 `package.json` 会自动把 `dsh-deepseek-search` 加入 `dependencies` 和 `dsh.profile.bundles`；插件包内的 `cordis.patch.yml` 会把 `web.searchProvider` 切到 `deepseek-search`。

### 方式 C：在 DSH 插件页安装

1. 打开 **设置 → 插件**。
2. 选择“从本地目录安装 / 安装本地插件”。
3. 选中本目录，安装后重启。

> 桌面端同一时间只建议由一种方式安装，重复安装前先卸载。

---

## 2. 使用

安装并重启后，正常和模型聊天即可。例如：

- “帮我查一下 DeepSeek Harness 最近有哪些值得装的插件，列出来源。”
- “用 web_research 调研一下 2026 年国产大模型 Agent 框架的差异，deep 深度。”
- “把这三篇文章的正文抓下来对比：https://… https://… https://…”

模型会自己选择：

| 工具 | 用途 |
| --- | --- |
| `web_search`（原生） | 普通搜索，返回标题、URL、摘要；现在由本插件的多引擎链提供结果 |
| `web_fetch`（原生） | 打开单个 URL，DSH 自带，带 SSRF 防护与正文转换 |
| `web_research` | 多查询、多引擎搜索 + 抓取前 N 页正文 + 汇总；适合调研 |
| `web_collect` | 批量抓取指定 URL 的正文；适合已有链接 |
| `web_engines` | 查看引擎是否可用、配置路径、当前参数 |

### web_research 参数

| 参数 | 说明 |
| --- | --- |
| `query` | 必填，主题/问题，建议关键词 |
| `queries` | 可选，额外的查询角度，最多 4 组 |
| `depth` | `quick`（3 页）/ `standard`（6 页）/ `deep`（10 页） |
| `maxPages` | 可选，1–10，覆盖 depth 的页数 |
| `engines` | 可选，指定引擎 id，如 `["bing","baidu"]` |

### web_collect 参数

| 参数 | 说明 |
| --- | --- |
| `urls` | 必填，1–10 个 http(s) URL |
| `maxCharsPerPage` | 每页正文上限，1000–50000 |
| `includeLinks` | 是否附带页面内链接 |

### 小技巧

- 问“最新/今天/价格/版本号”这类问题时，明确要求“用 web_research 查并给出来源链接”。
- 需要更全的中文资料时，在设置页同时打开百度、搜狗、360。
- 需要英文/技术资料时，填 Tavily 或 Exa 的 Key 并启用；它们的结果通常比网页解析稳定。
- 单页读不到正文时，先试 `web_fetch`；仍不行再用 `web_collect` 或换 URL。

---

## 3. 设置页

**设置 → DeepSeek 搜索**：

- 免费引擎：必应、百度、搜狗、360、DuckDuckGo、SearXNG。
- API 引擎：Tavily、Exa、Firecrawl、Brave、Serper。
- 每个引擎可单独启用/停用；API 引擎填写 Key 后才会可用。
- “抓取与结果设置”可调：每引擎结果数、单引擎超时、整次搜索超时、每页正文上限、深度收集默认页数、缓存时间。
- “试搜”会使用**已保存**的配置，直接显示聚合后的前 10 条结果和引擎来源。

Key 只写入本机配置文件，设置页只显示 `••••` 加后四位；保存时留空表示保持原 Key。

---

## 4. 引擎与配置

### 引擎

| id | 名称 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `bing` | 必应 Bing | 免费 | 开 | 默认走 `cn.bing.com`，可改地址 |
| `baidu` | 百度 | 免费 | 开 | 中文覆盖好；结果条数受反爬影响 |
| `sogou` | 搜狗 | 免费 | 开 | 公众号内容多；跳转壳会自动解析 |
| `so360` | 360 搜索 | 免费 | 开 | 作为中文补充 |
| `duckduckgo` | DuckDuckGo | 免费 | 关 | 大陆通常需代理 |
| `searxng` | SearXNG | 自建 | 关 | 填实例地址；需实例开启 JSON 输出 |
| `tavily` | Tavily | API | 关 | 需 `TAVILY_API_KEY` 或设置页 Key |
| `exa` | Exa | API | 关 | 需 `EXA_API_KEY` |
| `firecrawl` | Firecrawl | API | 关 | 需 `FIRECRAWL_API_KEY` |
| `brave` | Brave Search | API | 关 | 需 `BRAVE_API_KEY` |
| `serper` | Serper (Google) | API | 关 | 需 `SERPER_API_KEY` |

### 配置文件

默认路径：

```text
C:\Users\<你的用户名>\.dsh\deepseek-search\config.json
```

- 也可用环境变量 `DSH_DEEPSEEK_SEARCH_CONFIG` 指定其他路径。
- API Key 也可以放在环境变量里（配置留空时读取）：`TAVILY_API_KEY`、`EXA_API_KEY`、`FIRECRAWL_API_KEY`、`BRAVE_API_KEY`、`SERPER_API_KEY`。
- 参考 `config.example.json`。修改后可在设置页点“保存”，或直接重启 DSH。

### 关键字段

```json
{
  "engines": {
    "bing": { "enabled": true, "baseURL": "https://cn.bing.com", "weight": 1 },
    "tavily": { "enabled": true, "apiKey": "<your-tavily-key>", "weight": 1.1 }
  },
  "search": {
    "resultsPerEngine": 10,
    "engineTimeoutMs": 15000,
    "totalTimeoutMs": 30000,
    "maxEnginesPerQuery": 6,
    "cacheTtlMs": 180000
  },
  "fetch": {
    "maxCharsPerPage": 12000,
    "researchMaxPages": 6,
    "concurrency": 3,
    "readerBaseURL": ""
  }
}
```

- `weight` 影响 RRF 排序权重，默认必应 1、百度 0.95、搜狗 0.85、360 0.8，API 引擎略高。
- `readerBaseURL` 可选：正文过短时调用第三方阅读器，支持 `{url}` 占位符，例如 `https://r.jina.ai/{url}`。默认关闭。

---

## 5. 工作原理

1. **搜索层**：并行请求已启用的引擎，解析各自 HTML/JSON；单引擎失败只记警告，不影响其他引擎。
2. **合并层**：按 URL 去重，用加权 Reciprocal Rank Fusion 排序；多个引擎共同命中会加分。
3. **跳转解析**：搜狗/360/百度的 `/link` 跳转壳会被解析成真实域名，解析失败的结果丢弃。
4. **抓取层**：通过 DSH 的 `ctx.web.fetch()` 读取页面，复用其 SSRF 防护、DNS 校验、连接固定、重定向和大小限制。插件 bundle 补丁会同时固定 `web.searchProvider: deepseek-search` 和 `web.fetchProvider: http`；因为补丁层的 `config` 是替换而不是深合并，漏掉 `fetchProvider` 会让 `deepseek-fetch-api` 与 `http` 同时可用并报歧义。
5. **正文层**：轻量 HTML 解析，优先 `article` / `main` / 公众号 `#js_content` / CSDN `#content_views` / 知乎 `RichText` / GitHub `markdown-body`，按文本长度和链接密度选最佳容器。
6. **汇总层**：按域名分散选页（同域最多 2 页），并发抓取，输出标题、URL、来源引擎、时间、摘要和正文。

---

## 6. 安全与隐私

- 搜索请求只发往引擎/API 的官方地址；页面抓取走 DSH 的 `ctx.web.fetch()`，不会绕过它的公网地址校验。
- 不收集、不上传你的 Key；Key 只写入本机 `~/.dsh/deepseek-search/config.json`（尽力设为 0600）。
- 工具输出会明确标注“网页内容属于外部不可信数据”，模型不应执行网页里的指令。
- 正文长度有上限，避免把超长网页塞进上下文。
- 本插件不执行网页脚本，不解析 PDF/压缩包/音视频；遇到这些会返回明确错误。

---

## 7. 故障排查

### 设置页没有“DeepSeek 搜索”

- 确认已重启 DSH（Host 插件必须重启，Client 页面才会出现）。
- 打开 **设置 → 插件**，确认 `dsh-deepseek-search` 已安装且启用。
- 查看 profile：`C:\Users\<你>\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles` 是否包含它。
- 如果安装时 DSH 正在运行，先完全退出再重装。

### 原生 `web_search` 仍然走 DeepSeek 官方搜索

- 检查 profile 的 `cordis.patch.yml` 是否有：

  ```yaml
  - id: web
    config:
      searchProvider: deepseek-search
  ```

- 或打开 **设置 → 插件 → 内置插件设置 → 网页搜索**，确认提供方已切换。切换后重启。

### 搜索返回 0 条

- 在设置页“试搜”看 warnings：常见是百度/搜狗反爬、网络超时、API Key 无效。
- 先只开必应测试；确认网络能访问 `https://cn.bing.com`。
- 百度/搜狗偶尔返回验证页，过几分钟或换关键词再试。
- 打开 Tavily/Exa 作为稳定后备。

### 页面抓取失败

- 公众号、知乎、CSDN 等可能有反爬；`web_fetch` 失败时换用文章镜像或搜索结果里的其他来源。
- PDF、压缩包、音视频会明确提示不支持。
- 需要代理才能访问的站点，DSH 的 fetch 会按它的代理配置处理；搜索引擎请求走本插件的直连 fetch，可能不走同一个代理。
- 如果错误是 `multiple usable web providers are registered (deepseek-fetch-api, http)`，说明 `web` 的 `fetchProvider` 没有被固定。请确认插件自带的 `cordis.patch.yml` 同时包含 `searchProvider: deepseek-search` 和 `fetchProvider: http`；旧版本可在 profile 的 `cordis.patch.yml` 里补上，然后重载/重启。

### 超时

- 调低“每引擎结果数”，或调低“整次搜索超时”。
- `deep` 深度会抓 10 页，慢是正常的；日常用 `standard`。

---

## 8. 卸载

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
```

或：

```powershell
$dsh = "D:\deepseekharness\resources\runtime\cli\bin\dsh.cmd"
& $dsh plugin --profile desktop remove dsh-deepseek-search
```

卸载后重启 DSH。配置文件默认保留在 `~/.dsh/deepseek-search/config.json`；如需彻底清除，加 `-PurgeConfig` 或手动删除该目录。

---

## 9. 开发与测试

本插件**不需要构建**：`lib/index.mjs` 是 Host ESM，`lib/client.js` 是手写的 `__ModuleLoader__.load` 浏览器包，直接改源码即可。

```powershell
# 语法检查
node --check lib/index.mjs
node --check lib/client.js

# CI 同款离线测试：解析器、配置、正文提取、输出格式化
node test/offline.test.mjs

# Client bundle 包装与设置页注册
node test/client.test.mjs

# 也可以直接跑 npm test（offline + client，不访问网络）
npm test

# 真实网络冒烟：多引擎搜索
node test/engines.test.mjs "DeepSeek Harness 插件"

# 正文提取（网络）
node test/extract.test.mjs

# 搜索 + 抓取 + 汇总（网络）
node test/research.test.mjs

# 假 ctx 下的 Host 集成测试（工具、提供方、设置路由，需要网络）
node test/host.test.mjs
```

GitHub Actions 的 `CI` 工作流只跑离线测试和 bundle 包装检查，不会访问搜索引擎，因此在 CI 中稳定。真实网络测试保留给本地手动运行。

目录：

```text
dsh-deepseek-search/
├─ lib/
│  ├─ index.mjs      Host 入口：提供方、3 个工具、HTTP 路由
│  ├─ config.mjs     配置模型、默认值、持久化、脱敏
│  ├─ engines.mjs    引擎实现、解析、RRF 合并、跳转解析
│  ├─ html.mjs       轻量正文提取
│  ├─ research.mjs   抓取、批量收集、深度收集、输出格式化
│  └─ client.js      设置页浏览器包
├─ test/             离线测试 + 真实网络冒烟/集成测试
├─ .github/workflows/ci.yml
├─ cordis.patch.yml  插件 bundle 补丁
├─ package.json
├─ config.example.json
├─ install.ps1 / uninstall.ps1 / 安装.cmd / 卸载.cmd
├─ SECURITY.md
├─ CONTRIBUTING.md
└─ README.md
```

---

## 10. 已知限制

- 免费引擎靠 HTML 解析，搜索引擎改版或反爬会导致结果变少；API 引擎更稳。
- 百度在无 Cookie 的请求下通常只返回少量结果。
- 搜狗/360 的部分结果是跳转壳，需要额外一次请求解析；解析失败会丢弃。
- 不支持 PDF、Office 文档、音视频转写；这些需要额外解析器。
- 纯前端渲染（SPA）页面可能正文过短；可配置 `readerBaseURL` 走阅读器。
- 搜索引擎请求不走 DSH 的 `ctx.web.fetch` 代理链；需要代理才能访问的引擎（DuckDuckGo/Google/Brave）请自行确认系统网络。
- 本插件不替代 DSH 自带的 `web_fetch`；两者可以同时使用。

---

## Contributing

见 [CONTRIBUTING.md](CONTRIBUTING.md)。提交前请运行 `npm test`，并确保不要把任何真实 API Key 写进仓库。

## License

MIT
