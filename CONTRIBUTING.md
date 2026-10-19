# Contributing

欢迎提交 issue 和 pull request。

## 开发环境

- Node.js 20+
- DeepSeek Harness 0.2.x（桌面端或 `dsh web` profile）
- Windows 安装脚本需要 PowerShell 5.1+

本插件不需要构建步骤：

- Host 半：`lib/index.mjs`（ESM）
- Client 半：`lib/client.js`（`window.__ModuleLoader__.load` 包装）
- 直接修改 `lib/` 下的文件即可

## 提交前

```powershell
# 语法
node --check lib/index.mjs
node --check lib/client.js

# CI 同款离线测试（不访问网络）
npm test
```

真实网络测试需要能访问必应/百度等站点：

```powershell
node test/engines.test.mjs
node test/extract.test.mjs
node test/research.test.mjs
node test/host.test.mjs
```

## 安全

- 不要提交 `config.json`、`.env` 或任何真实 API Key。
- 新引擎必须处理超时、HTTP 错误、空结果和 HTML 转义。
- 抓取功能应继续走 `ctx.web.fetch()`，不要绕过 DSH 的公网地址校验。
- 如果改动涉及安全边界，请在 PR 描述里说明威胁模型。

## 引擎适配

新增引擎时至少修改：

1. `lib/config.mjs` 的 `ENGINE_CATALOG` 和默认值；
2. `lib/engines.mjs` 的 `RUNNERS` 与解析/请求函数；
3. `test/offline.test.mjs` 增加解析器 fixture；
4. `README.md` 的引擎表和配置说明。

## 许可证

提交的代码默认按本仓库的 MIT License 授权。
