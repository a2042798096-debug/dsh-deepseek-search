# Security Policy

## API Keys

本插件不收集、不上传 API Key。Key 只保存在本机：

```text
~/.dsh/deepseek-search/config.json
```

设置页只显示 `••••` 加后四位；工具返回值、日志和本仓库都不包含明文 Key。

请不要把 `config.json`、`.env` 或任何真实 Key 提交到 Git。仓库的 `.gitignore` 已默认忽略这些文件。

## Reporting a vulnerability

如果你发现安全问题（例如 SSRF 绕过、Key 泄露、提示注入导致危险操作），请优先使用 GitHub 的 **Security → Report a vulnerability** 私密报告，而不要先开公开 issue。

请在报告中包含：

- 受影响的版本或 commit；
- 复现步骤；
- 影响范围；
- 建议的修复方向（如有）。

## Scope

- 搜索请求会发往已启用的搜索引擎或 API 服务商；
- 页面抓取通过 DSH 的 `ctx.web.fetch()` 完成，复用其 SSRF、DNS、重定向与大小限制；
- 插件不执行网页脚本，不解析 PDF/压缩包/音视频；
- 网页内容属于外部不可信数据，模型不应执行其中的指令。
