/**
 * DeepSeek 搜索 —— DSH Host 半。
 *
 * 注册三样东西：
 *   1. ctx.web 的搜索提供方 `deepseek-search`（原生 web_search 直接使用它）；
 *   2. 模型工具 web_research / web_collect / web_engines；
 *   3. 设置页使用的 /deepseek-search/* HTTP 路由。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  applyConfigPatch,
  listEngineStatus,
  loadConfig,
  publicConfig,
  resolveConfigPath,
  saveConfig,
} from './config.mjs'
import { clearSearchCache, getEngineHealth, getSearchCacheStats, searchWithEngines } from './engines.mjs'
import {
  collectUrls,
  formatCollect,
  formatResearch,
  researchTopic,
} from './research.mjs'

export const name = 'deepseek-search'
export const inject = ['web', 'tools', 'webServer']

/* ------------------------------------------------------------------ */
/* 配置存储                                                            */
/* ------------------------------------------------------------------ */

function createStore(pluginConfig) {
  const explicit = pluginConfig?.configPath
  const filePath = explicit ? resolveConfigPath({ ...process.env, DSH_DEEPSEEK_SEARCH_CONFIG: String(explicit) }) : resolveConfigPath()
  const loaded = loadConfig(filePath)
  return {
    path: loaded.path,
    exists: loaded.exists,
    config: loaded.config,
    warnings: loaded.warnings,
    get() {
      return this.config
    },
    replace(config, warnings = []) {
      this.config = config
      this.warnings = warnings
      this.exists = true
    },
  }
}

function engineStatusWithHealth(store) {
  const health = getEngineHealth()
  return listEngineStatus(store.get()).map((engine) => ({
    ...engine,
    lastError: health[engine.id]?.message ?? '',
  }))
}

function configSnapshot(store) {
  return {
    ok: true,
    config: publicConfig(store.get()),
    engines: engineStatusWithHealth(store),
    configPath: store.path,
    exists: store.exists,
    warnings: store.warnings,
    cache: getSearchCacheStats(),
  }
}

function readableError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '未知错误')
  return message.replace(/^Error:\s*/u, '').trim() || '未知错误'
}

/** 输出 schema 不接受 undefined 属性；JSON 往返同时做一次安全快照。 */
function toPlainJSON(value) {
  return JSON.parse(JSON.stringify(value))
}

/* ------------------------------------------------------------------ */
/* 输出 Schema（defineTool 要求显式 additionalProperties）              */
/* ------------------------------------------------------------------ */

const failureSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string' },
    error: { type: 'string' },
  },
}

const researchResultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    url: { type: 'string' },
    snippet: { type: 'string' },
    publishedAt: { type: 'string' },
    engine: { type: 'string' },
    engines: { type: 'array', items: { type: 'string' } },
    content: { type: 'string' },
    excerpt: { type: 'string' },
    contentChars: { type: 'number' },
    truncated: { type: 'boolean' },
    status: { type: 'string', enum: ['ok', 'error'] },
  },
}

const researchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    query: { type: 'string' },
    queries: { type: 'array', items: { type: 'string' } },
    depth: { type: 'string', enum: ['quick', 'standard', 'deep'] },
    engines: { type: 'array', items: { type: 'string' } },
    results: { type: 'array', items: researchResultSchema },
    failures: { type: 'array', items: failureSchema },
    notes: { type: 'array', items: { type: 'string' } },
    elapsedMs: { type: 'number' },
  },
}

const pageSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    url: { type: 'string' },
    statusCode: { type: 'number' },
    title: { type: 'string' },
    description: { type: 'string' },
    canonicalUrl: { type: 'string' },
    publishedAt: { type: 'string' },
    siteName: { type: 'string' },
    content: { type: 'string' },
    excerpt: { type: 'string' },
    contentChars: { type: 'number' },
    wordCount: { type: 'number' },
    truncated: { type: 'boolean' },
    lowContent: { type: 'boolean' },
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
  },
}

const collectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    pages: { type: 'array', items: pageSchema },
    failures: { type: 'array', items: failureSchema },
    elapsedMs: { type: 'number' },
    truncated: { type: 'boolean' },
  },
}

const engineStatusSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    kind: { type: 'string' },
    region: { type: 'string' },
    needsKey: { type: 'boolean' },
    keyEnv: { type: 'string' },
    description: { type: 'string' },
    enabled: { type: 'boolean' },
    available: { type: 'boolean' },
    hasKey: { type: 'boolean' },
    keyPreview: { type: 'string' },
    baseURL: { type: 'string' },
    weight: { type: 'number' },
    lastError: { type: 'string' },
  },
}

const enginesSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    engines: { type: 'array', items: engineStatusSchema },
    configPath: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
    search: { type: 'object', additionalProperties: true },
    fetch: { type: 'object', additionalProperties: true },
  },
}

/* ------------------------------------------------------------------ */
/* Host 插件入口                                                       */
/* ------------------------------------------------------------------ */

export function apply(ctx, pluginConfig) {
  const store = createStore(pluginConfig)

  // 1) 搜索提供方：让原生 web_search 走多引擎聚合。
  const provider = {
    id: 'deepseek-search',
    available() {
      return listEngineStatus(store.get()).some((engine) => engine.available)
    },
    async search(request, signal) {
      const query = String(request?.query ?? '').trim()
      if (!query) throw new Error('web_search 的 query 为空')
      const maxResults = Number.isFinite(request?.maxResults)
        ? Math.max(1, Math.min(50, request.maxResults))
        : 10
      const result = await searchWithEngines(query, {
        config: store.get(),
        signal,
        maxResults,
        webFetch: (url, fetchSignal) => ctx.web.fetch({ url }, fetchSignal),
      })
      if (result.sources.length === 0) {
        const detail = result.warnings.length
          ? result.warnings.map((warning) => `${warning.engine}: ${warning.message}`).join('；')
          : '所有引擎都没有返回可用结果'
        throw new Error(`DeepSeek 搜索没有找到结果（${detail}）`)
      }
      return {
        sources: result.sources.map((item) => ({
          url: item.url,
          title: item.title,
          ...(item.snippet ? { snippet: item.snippet } : {}),
          ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
        })),
        truncated: false,
      }
    },
  }
  ctx.effect(() => ctx.web.registerSearchProvider(provider), 'deepseek-search: web search provider')

  // 2) 模型工具。
  ctx.tools.register(
    defineTool({
      name: 'web_research',
      description:
        '在多个搜索引擎上检索一个主题，抓取排名靠前的网页正文并汇总成带出处的资料。适合需要跨网页收集、核对事实、做调研的问题。' +
        '先用简短关键词 query；需要覆盖不同角度时用 queries 提供 2-4 组查询。已知具体 URL 时改用 web_fetch 或 web_collect。',
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: '要调研的主题或问题，尽量使用关键词而不是整段长句。',
        },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：额外的查询角度，最多 4 组；会与 query 一起去重后分别检索。',
        },
        depth: {
          type: 'string',
          enum: ['quick', 'standard', 'deep'],
          default: 'standard',
          description: 'quick 抓 3 页、standard 抓 6 页、deep 抓 10 页；页面越多越慢。',
        },
        maxPages: {
          type: 'number',
          description: '可选：本次最多抓取多少页，1-10；不填时按 depth 决定。',
        },
        includeContent: {
          type: 'boolean',
          description: '是否返回每页完整正文；false 时只返回摘要/节选，适合节省上下文。默认 true。',
        },
        engines: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：指定引擎 id（bing/baidu/sogou/so360/tavily 等）；不填时使用设置页启用的引擎。',
        },
      },
      output: {
        schema: researchSchema,
        render: (_args, value) => [{ type: 'text', text: formatResearch(value) }],
      },
      timeoutMs: 120000,
      isConcurrencySafe: true,
      async execute(args, exec) {
        try {
          return toPlainJSON(
            await researchTopic(ctx, args, {
              config: store.get(),
              signal: exec.signal,
              webFetch: (url, fetchSignal) => ctx.web.fetch({ url }, fetchSignal),
            }),
          )
        } catch (error) {
          return {
            ok: false,
            error: readableError(error),
            query: String(args?.query ?? ''),
            queries: [],
            depth: 'standard',
            engines: [],
            results: [],
            failures: [],
            notes: [],
          }
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'web_collect',
      description:
        '批量抓取指定网页的正文并汇总。适合已经拿到多个 URL、需要一次读完并对照的场景。' +
        '单页用 web_fetch 即可；需要先搜索再抓取时用 web_research。',
      parameters: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: '要抓取的 http(s) URL，1-10 个。',
        },
        maxCharsPerPage: {
          type: 'number',
          description: '每页正文最多保留多少字符，1000-50000，默认取设置页的值。',
        },
        includeLinks: {
          type: 'boolean',
          description: '是否在结果中附带页面内链接，默认 false。',
        },
      },
      output: {
        schema: collectSchema,
        render: (_args, value) => [{ type: 'text', text: formatCollect(value) }],
      },
      timeoutMs: 90000,
      isConcurrencySafe: true,
      async execute(args, exec) {
        try {
          const urls = Array.isArray(args?.urls) ? args.urls : []
          if (urls.length === 0) throw new Error('urls 至少需要一个 http(s) 地址')
          const value = await collectUrls(ctx, urls, {
            config: store.get(),
            signal: exec.signal,
            maxChars: Number.isFinite(args?.maxCharsPerPage)
              ? Math.max(1000, Math.min(50000, args.maxCharsPerPage))
              : undefined,
            includeLinks: Boolean(args?.includeLinks),
          })
          return toPlainJSON({
            ok: true,
            pages: value.pages,
            failures: value.failures,
            elapsedMs: value.elapsedMs,
            truncated: value.truncated,
          })
        } catch (error) {
          return {
            ok: false,
            error: readableError(error),
            pages: [],
            failures: [],
          }
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'web_engines',
      description:
        '查看 DeepSeek 搜索当前启用的搜索引擎、可用状态和配置路径。搜索失败或想确认某个 API 引擎是否配置好时使用。',
      parameters: {},
      output: {
        schema: enginesSchema,
        render: (_args, value) => {
          if (!value?.ok) return [{ type: 'text', text: `读取引擎状态失败：${value?.error ?? '未知错误'}` }]
          const lines = ['# DeepSeek 搜索引擎状态', '', `配置文件：${value.configPath}`, '']
          for (const engine of value.engines ?? []) {
            const status = engine.available ? '可用' : engine.enabled ? '已启用但缺少密钥/地址' : '未启用'
            lines.push(
              `- ${engine.label}（${engine.id}）：${status}${engine.hasKey ? `，Key ${engine.keyPreview}` : ''}` +
                (engine.lastError ? `；最近错误：${engine.lastError}` : ''),
            )
          }
          if (value.warnings?.length) lines.push('', '配置提示：', ...value.warnings.map((item) => `- ${item}`))
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      timeoutMs: 15000,
      isConcurrencySafe: true,
      async execute() {
        const snapshot = configSnapshot(store)
        return toPlainJSON({
          ok: true,
          engines: snapshot.engines,
          configPath: snapshot.configPath,
          warnings: snapshot.warnings,
          search: snapshot.config.search,
          fetch: snapshot.config.fetch,
        })
      },
    }),
  )

  // 3) 设置页路由。
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/deepseek-search',
        handler: (request, response) => handleRoute(request, response, store),
      }),
    'deepseek-search: settings routes',
  )
}

/* ------------------------------------------------------------------ */
/* HTTP 路由                                                           */
/* ------------------------------------------------------------------ */

async function handleRoute(request, response, store) {
  const method = String(request.method ?? 'GET').toUpperCase()
  const url = new URL(String(request.url ?? '/'), 'http://localhost')
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  if (method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    })
    response.end()
    return
  }

  try {
    if (pathname === '/deepseek-search/config' && method === 'GET') {
      sendJSON(response, 200, configSnapshot(store))
      return
    }

    if (pathname === '/deepseek-search/config' && method === 'POST') {
      const body = await readJSON(request)
      const { config, warnings } = applyConfigPatch(store.get(), body?.config, body?.keys ?? {})
      const savedPath = saveConfig(store.path, config)
      store.replace(config, warnings)
      clearSearchCache()
      sendJSON(response, 200, {
        ...configSnapshot(store),
        savedPath,
      })
      return
    }

    if (pathname === '/deepseek-search/test' && method === 'POST') {
      const body = await readJSON(request)
      const query = String(body?.query ?? '').trim()
      if (!query) {
        sendJSON(response, 400, { ok: false, error: 'query 不能为空' })
        return
      }
      const started = Date.now()
      const result = await searchWithEngines(query, {
        config: store.get(),
        signal: AbortSignal.timeout(25000),
        engineIds: Array.isArray(body?.engines) ? body.engines : undefined,
        maxResults: 10,
        resultsPerEngine: 8,
        useCache: false,
        webFetch: (url, fetchSignal) => ctx.web.fetch({ url }, fetchSignal),
      })
      sendJSON(response, 200, {
        ok: true,
        query,
        elapsedMs: Date.now() - started,
        engines: result.engines,
        results: result.sources.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          engines: item.engines,
        })),
        warnings: result.warnings,
        timings: result.timings,
      })
      return
    }

    if (pathname === '/deepseek-search/cache/clear' && method === 'POST') {
      clearSearchCache()
      sendJSON(response, 200, { ok: true, cache: getSearchCacheStats() })
      return
    }

    if (pathname === '/deepseek-search/engines' && method === 'GET') {
      sendJSON(response, 200, configSnapshot(store))
      return
    }

    sendJSON(response, 404, { ok: false, error: `未知路由：${method} ${pathname}` })
  } catch (error) {
    sendJSON(response, 500, { ok: false, error: readableError(error) })
  }
}

function sendJSON(response, statusCode, value) {
  if (response.headersSent) return
  const payload = JSON.stringify(value)
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function readJSON(request, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(new Error(`请求体不是 JSON：${error.message}`))
      }
    })
    request.on('error', reject)
    request.on('aborted', () => reject(new Error('请求被中断')))
  })
}
