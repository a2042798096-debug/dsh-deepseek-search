/**
 * DeepSeek 搜索 —— 多引擎检索层。
 *
 * 页面解析只依赖 HTML 的稳定结构，不引入 cheerio/jsdom 等依赖，保证插件
 * 在 DSH 的桌面运行时里零安装即可加载。所有网络请求都受超时与 AbortSignal
 * 控制；单个引擎失败不会拖垮整次搜索。
 */
import {
  ENGINE_CATALOG,
  engineAvailable,
  resolveEngineKey,
} from './config.mjs'

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const RRF_K = 60

/** 搜索层可恢复错误。 */
export class EngineError extends Error {
  constructor(engine, message, options = {}) {
    super(message, options)
    this.name = 'EngineError'
    this.engine = engine
  }
}

/* ------------------------------------------------------------------ */
/* HTML 基础工具                                                       */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  divide: '÷',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  deg: '°',
  plusmn: '±',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup2: '²',
  sup3: '³',
  micro: 'µ',
  para: '¶',
  sect: '§',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
}

export function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => safeCodePoint(parseInt(decimal, 10)))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
}

function safeCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/** 去标签、去脚本样式、压缩空白，得到单行文本。 */
export function stripTags(value) {
  return decodeEntities(
    String(value ?? '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[\u00a0\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanText(value) {
  return stripTags(value)
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    // 搜索结果里的 <em> 高亮会在中文词之间留下空格：百度 标题 → 百度标题。
    .replace(/([\u3400-\u9fff0-9])\s+(?=[\u3400-\u9fff0-9])/g, '$1')
    .trim()
}

/* ------------------------------------------------------------------ */
/* URL 归一化                                                          */
/* ------------------------------------------------------------------ */

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'spm',
  'scm',
  'fbclid',
  'gclid',
  'yclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
]

/** 搜索/跳转类 URL：不应作为资料页返回。 */
export function isInternalSearchUrl(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const pathname = url.pathname
    if (host.endsWith('sogou.com') && pathname.startsWith('/web')) return true
    if (host.endsWith('so.com') && (pathname === '/s' || pathname === '/link')) return true
    if (host.endsWith('baidu.com') && pathname.startsWith('/s')) return true
    if (host.endsWith('bing.com') && pathname.startsWith('/search')) return true
    if (/(^|\.)google\./i.test(host) && pathname.startsWith('/search')) return true
    return false
  } catch {
    return true
  }
}

function decodeBingRedirect(url) {
  if (!url.hostname.endsWith('bing.com') || url.pathname !== '/ck/a') return null
  const encoded = url.searchParams.get('u')
  if (!encoded || !encoded.startsWith('a1')) return null
  try {
    const base64 = encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/')
    const decoded = Buffer.from(base64, 'base64').toString('utf8')
    if (/^https?:\/\//i.test(decoded)) return decoded
  } catch {
    /* 忽略损坏的跳转参数 */
  }
  return null
}

/**
 * 把搜索引擎返回的 href 变成可直接输出的 http(s) URL。
 * 不解析 Sogou/360 的跳转壳；那一步由 resolveRedirect() 异步完成。
 */
export function normalizeResultUrl(raw, base = '') {
  let value = decodeEntities(String(raw ?? '')).trim()
  value = value.replace(/^['"]|['"]$/g, '')
  if (!value) return ''
  if (value.startsWith('//')) value = `https:${value}`
  if (value.startsWith('/')) {
    try {
      value = new URL(value, base || 'https://www.bing.com').href
    } catch {
      return ''
    }
  }
  if (!/^https?:\/\//i.test(value)) return ''
  let url
  try {
    url = new URL(value)
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''

  const bingTarget = decodeBingRedirect(url)
  if (bingTarget) return normalizeResultUrl(bingTarget)

  if (url.hostname.endsWith('duckduckgo.com') && url.pathname === '/l/') {
    const target = url.searchParams.get('uddg')
    if (target) return normalizeResultUrl(target)
  }

  url.hash = ''
  for (const key of TRACKING_PARAMS) url.searchParams.delete(key)
  return url.href
}

/** 去重键：忽略 www、末尾斜杠、锚点与常见跟踪参数。 */
export function canonicalUrl(value) {
  const normalized = normalizeResultUrl(value)
  if (!normalized) return ''
  try {
    const url = new URL(normalized)
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    url.hash = ''
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
    url.searchParams.sort()
    return url.href
  } catch {
    return normalized
  }
}

/* ------------------------------------------------------------------ */
/* 日期                                                                */
/* ------------------------------------------------------------------ */

const DATE_PATTERN =
  /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?|\d{1,2}\s*(?:分钟|小时|天)前|\d{1,2}\s*(?:min|hour|day)s?\s+ago)/i

export function extractDate(value) {
  const text = cleanText(value)
  const match = DATE_PATTERN.exec(text)
  return match ? match[1] : undefined
}

/* ------------------------------------------------------------------ */
/* 各引擎结果解析                                                       */
/* ------------------------------------------------------------------ */

export function parseBing(html) {
  const results = []
  const blocks = String(html).split(/<li class="b_algo"/i).slice(1)
  for (const block of blocks.slice(0, 20)) {
    if (/class="[^"]*b_ad\b/i.test(block)) continue
    const title = /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!title) continue
    const snippet =
      /<p[^>]*class="[^"]*(?:b_lineclamp|b_algoSlug|b_paractl)[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block) ??
      /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block)
    const item = {
      title: cleanText(title[2]),
      url: normalizeResultUrl(title[1]),
      snippet: cleanText(snippet?.[1] ?? ''),
      publishedAt: extractDate(snippet?.[1] ?? ''),
    }
    if (item.title && item.url) results.push(item)
  }
  return results
}

export function parseBaidu(html) {
  const results = []
  const blocks = String(html).split(/<div class="result c-container/i).slice(1)
  for (const block of blocks.slice(0, 20)) {
    const mu = /(?:^|\s)mu="([^"]+)"/i.exec(block)
    if (!mu) continue
    const url = normalizeResultUrl(mu[1], 'https://www.baidu.com')
    if (!url || isInternalSearchUrl(url) || /e\.baidu\.com/i.test(url)) continue
    const h3 = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(block)
    const snippet =
      /<span[^>]*class="[^"]*summary-text_[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block) ??
      /<div[^>]*data-module="abstract"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i.exec(block)
    const title = h3 ? cleanText(h3[1]) : ''
    if (!title) continue
    results.push({
      title,
      url,
      snippet: cleanText(snippet?.[1] ?? ''),
      publishedAt: extractDate(snippet?.[1] ?? ''),
    })
  }
  return results
}

export function parseSogou(html) {
  const results = []
  const blocks = String(html).split(/<div class="vrwrap"/i).slice(1)
  for (const block of blocks.slice(0, 20)) {
    if (/class="[^"]*vr-ad/i.test(block) || /(?:^|>)\s*广告\s*(?:<|$)/.test(block)) continue
    const title = /<h3[^>]*class="[^"]*vr-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!title) continue
    const snippet =
      /<p[^>]*class="[^"]*(?:star-wiki|space-txt|clamp\d|text-layout)[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block) ??
      /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block)
    const url = normalizeResultUrl(title[1], 'https://www.sogou.com')
    if (!url) continue
    results.push({
      title: cleanText(title[2]),
      url,
      snippet: cleanText(snippet?.[1] ?? ''),
      publishedAt: extractDate(block),
    })
  }
  return results
}

export function parseSo360(html) {
  const results = []
  const blocks = String(html).split(/<li class="res-list"/i).slice(1)
  for (const block of blocks.slice(0, 20)) {
    if (/data-result-type="[^"]*ad/i.test(block) || /(?:^|>)\s*广告\s*(?:<|$)/.test(block)) continue
    const anchor = /<h3[^>]*class="[^"]*res-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!anchor) continue
    const mdurl = /data-mdurl="([^"]+)"/i.exec(block)
    const url = normalizeResultUrl(mdurl?.[1] ?? anchor[1], 'https://www.so.com')
    if (!url) continue
    const snippet =
      /<p[^>]*class="[^"]*res-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block) ??
      /<span[^>]*class="[^"]*res-list-summary[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block)
    results.push({
      title: cleanText(anchor[2]),
      url,
      snippet: cleanText(snippet?.[1] ?? ''),
      publishedAt: extractDate(snippet?.[1] ?? ''),
    })
  }
  return results
}

export function parseDuckDuckGo(html) {
  const results = []
  const blocks = String(html).split(/<div class="result results_links/i).slice(1)
  for (const block of blocks.slice(0, 20)) {
    const anchor = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!anchor) continue
    const url = normalizeResultUrl(anchor[1], 'https://html.duckduckgo.com')
    if (!url) continue
    const snippet = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    results.push({
      title: cleanText(anchor[2]),
      url,
      snippet: cleanText(snippet?.[1] ?? ''),
    })
  }
  return results
}

/* ------------------------------------------------------------------ */
/* 网络请求                                                            */
/* ------------------------------------------------------------------ */

function requestHeaders(extra = {}) {
  return {
    'user-agent': DEFAULT_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-cache',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    ...extra,
  }
}

function combineSignals(signal, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`请求超时（${timeoutMs}ms）`))
  }, timeoutMs)
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) controller.abort(signal.reason)
  else signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * 直接 fetch 失败时的补充通道：走 DSH 的 ctx.web.fetch，复用它的代理、
 * DNS 校验、重定向和内容解码。只用于 GET；POST 搜索/API 无法透明重放。
 */
async function fetchViaWeb(url, context) {
  if (typeof context.webFetch !== 'function' || context.signal?.aborted) return undefined
  const combo = combineSignals(context.signal, context.timeoutMs)
  try {
    const page = await context.webFetch(url, combo.signal)
    const status = Number(page?.statusCode ?? 0)
    const text = String(page?.body?.content ?? '')
    if (status >= 400 || text.length === 0) return undefined
    return { status, text }
  } catch {
    return undefined
  } finally {
    combo.dispose()
  }
}

async function fetchText(url, options, context) {
  const method = String(options?.method ?? 'GET').toUpperCase()
  const combo = combineSignals(context.signal, context.timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: combo.signal, headers: requestHeaders(options?.headers) })
    const text = await response.text()
    if (!response.ok) {
      throw new EngineError(context.engine, `HTTP ${response.status}`, { cause: new Error(text.slice(0, 200)) })
    }
    return { response, text }
  } catch (error) {
    // 直连被重置/超时（常见于代理环境）时，再给 ctx.web.fetch 一次机会。
    const directHTTPError = error instanceof EngineError && /^HTTP \d+/u.test(error.message)
    if (method === 'GET' && !directHTTPError && !context.signal?.aborted) {
      const fallback = await fetchViaWeb(url, context)
      if (fallback) return { response: { ok: true, status: fallback.status }, text: fallback.text }
    }
    if (error instanceof EngineError) throw error
    throw new EngineError(context.engine, String(error?.message ?? error), { cause: error })
  } finally {
    combo.dispose()
  }
}

async function fetchJSON(url, options, context) {
  const method = String(options?.method ?? 'GET').toUpperCase()
  const combo = combineSignals(context.signal, context.timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: combo.signal, headers: requestHeaders(options?.headers) })
    const text = await response.text()
    if (!response.ok) {
      let detail = text.slice(0, 300)
      try {
        const parsed = JSON.parse(text)
        const candidate =
          typeof parsed?.error === 'string'
            ? parsed.error
            : (parsed?.error?.message ?? parsed?.message)
        if (typeof candidate === 'string' && candidate.length > 0) detail = candidate
      } catch {
        /* 保留原始片段 */
      }
      throw new EngineError(context.engine, `HTTP ${response.status}: ${String(detail)}`, {
        cause: new Error(String(detail)),
      })
    }
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new EngineError(context.engine, '接口返回的不是 JSON', { cause: error })
    }
  } catch (error) {
    const directHTTPError = error instanceof EngineError && /^HTTP \d+/u.test(error.message)
    if (method === 'GET' && !directHTTPError && !context.signal?.aborted) {
      const fallback = await fetchViaWeb(url, context)
      if (fallback) {
        try {
          return JSON.parse(fallback.text)
        } catch {
          /* 回退内容不是 JSON，继续抛原始错误 */
        }
      }
    }
    if (error instanceof EngineError) throw error
    throw new EngineError(context.engine, String(error?.message ?? error), { cause: error })
  } finally {
    combo.dispose()
  }
}

/* ------------------------------------------------------------------ */
/* 免费引擎                                                            */
/* ------------------------------------------------------------------ */

function endpoint(base, path) {
  const normalized = base.endsWith('/') ? base : `${base}/`
  return new URL(path.replace(/^\/+/, ''), normalized)
}

async function searchBing(query, engine, context) {
  const base = engine.baseURL || 'https://cn.bing.com'
  const url = endpoint(base, 'search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(context.resultsPerEngine))
  url.searchParams.set('setlang', 'zh-Hans')
  url.searchParams.set('cc', 'CN')
  url.searchParams.set('ensearch', '0')
  const { text } = await fetchText(url.href, {}, context)
  return parseBing(text)
}

async function searchBaidu(query, engine, context) {
  const url = new URL('https://www.baidu.com/s')
  url.searchParams.set('wd', query)
  url.searchParams.set('rn', String(context.resultsPerEngine))
  url.searchParams.set('ie', 'utf-8')
  const { text } = await fetchText(url.href, {}, context)
  return parseBaidu(text)
}

async function searchSogou(query, engine, context) {
  const url = new URL('https://www.sogou.com/web')
  url.searchParams.set('query', query)
  url.searchParams.set('ie', 'utf8')
  const { text } = await fetchText(url.href, {}, context)
  return parseSogou(text)
}

async function searchSo360(query, engine, context) {
  const url = new URL('https://www.so.com/s')
  url.searchParams.set('q', query)
  url.searchParams.set('pn', '1')
  const { text } = await fetchText(url.href, {}, context)
  return parseSo360(text)
}

async function searchDuckDuckGo(query, engine, context) {
  const body = new URLSearchParams({ q: query, kl: 'cn-zh' })
  const { text } = await fetchText(
    'https://html.duckduckgo.com/html/',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://html.duckduckgo.com',
        referer: 'https://html.duckduckgo.com/',
      },
      body,
    },
    context,
  )
  return parseDuckDuckGo(text)
}

async function searchSearXNG(query, engine, context) {
  const base = engine.baseURL
  if (!base) throw new EngineError('searxng', '未配置 SearXNG 实例地址')
  const url = endpoint(base, 'search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('language', 'zh-CN')
  url.searchParams.set('safesearch', '1')
  const data = await fetchJSON(url.href, { headers: { accept: 'application/json' } }, context)
  return Array.isArray(data?.results)
    ? data.results.map((item) => ({
        title: cleanText(item.title ?? ''),
        url: normalizeResultUrl(item.url ?? ''),
        snippet: cleanText(item.content ?? item.snippet ?? ''),
        publishedAt: extractDate(item.publishedDate ?? item.pubdate ?? ''),
      }))
    : []
}

/* ------------------------------------------------------------------ */
/* API 引擎                                                            */
/* ------------------------------------------------------------------ */

async function searchTavily(query, engine, context) {
  const key = resolveEngineKey('tavily', context.config, context.env)
  const data = await fetchJSON(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        max_results: context.resultsPerEngine,
        include_answer: false,
        include_raw_content: false,
      }),
    },
    context,
  )
  return Array.isArray(data?.results)
    ? data.results.map((item) => ({
        title: cleanText(item.title ?? ''),
        url: normalizeResultUrl(item.url ?? ''),
        snippet: cleanText(item.content ?? ''),
        publishedAt: item.published_date ? String(item.published_date) : extractDate(item.content ?? ''),
      }))
    : []
}

async function searchExa(query, engine, context) {
  const key = resolveEngineKey('exa', context.config, context.env)
  const data = await fetchJSON(
    'https://api.exa.ai/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        query,
        numResults: context.resultsPerEngine,
        type: 'auto',
        contents: { text: { maxCharacters: 600 } },
      }),
    },
    context,
  )
  return Array.isArray(data?.results)
    ? data.results.map((item) => ({
        title: cleanText(item.title ?? ''),
        url: normalizeResultUrl(item.url ?? ''),
        snippet: cleanText(item.text ?? item.summary ?? ''),
        publishedAt: item.publishedDate ? String(item.publishedDate) : undefined,
      }))
    : []
}

async function searchFirecrawl(query, engine, context) {
  const key = resolveEngineKey('firecrawl', context.config, context.env)
  const data = await fetchJSON(
    'https://api.firecrawl.dev/v1/search',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query, limit: context.resultsPerEngine, sources: ['web'] }),
    },
    context,
  )
  const items = Array.isArray(data?.data) ? data.data : (data?.data?.web ?? [])
  return items.map((item) => ({
    title: cleanText(item.title ?? ''),
    url: normalizeResultUrl(item.url ?? ''),
    snippet: cleanText(item.description ?? item.snippet ?? item.markdown ?? ''),
    publishedAt: item.publishedAt ? String(item.publishedAt) : undefined,
  }))
}

async function searchBrave(query, engine, context) {
  const key = resolveEngineKey('brave', context.config, context.env)
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(context.resultsPerEngine))
  url.searchParams.set('country', 'cn')
  url.searchParams.set('search_lang', 'zh-hans')
  const data = await fetchJSON(
    url.href,
    {
      headers: {
        accept: 'application/json',
        'x-subscription-token': key,
      },
    },
    context,
  )
  const items = data?.web?.results ?? []
  return items.map((item) => ({
    title: cleanText(item.title ?? ''),
    url: normalizeResultUrl(item.url ?? ''),
    snippet: cleanText(item.description ?? ''),
    publishedAt: item.age ? String(item.age) : undefined,
  }))
}

async function searchSerper(query, engine, context) {
  const key = resolveEngineKey('serper', context.config, context.env)
  const data = await fetchJSON(
    'https://google.serper.dev/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-api-key': key },
      body: JSON.stringify({ q: query, num: context.resultsPerEngine, gl: 'cn', hl: 'zh-cn' }),
    },
    context,
  )
  return Array.isArray(data?.organic)
    ? data.organic.map((item) => ({
        title: cleanText(item.title ?? ''),
        url: normalizeResultUrl(item.link ?? ''),
        snippet: cleanText(item.snippet ?? ''),
        publishedAt: item.date ? String(item.date) : undefined,
      }))
    : []
}

const RUNNERS = {
  bing: searchBing,
  baidu: searchBaidu,
  sogou: searchSogou,
  so360: searchSo360,
  duckduckgo: searchDuckDuckGo,
  searxng: searchSearXNG,
  tavily: searchTavily,
  exa: searchExa,
  firecrawl: searchFirecrawl,
  brave: searchBrave,
  serper: searchSerper,
}

/* ------------------------------------------------------------------ */
/* 跳转壳解析                                                           */
/* ------------------------------------------------------------------ */

const redirectCache = new Map()

function isRedirectShim(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (host.endsWith('sogou.com') && url.pathname === '/link') return true
    if (host.endsWith('so.com') && url.pathname === '/link') return true
    if (host.endsWith('baidu.com') && url.pathname === '/link') return true
    return false
  } catch {
    return false
  }
}

/**
 * 解析搜狗/360/百度的 /link 跳转壳，返回真实地址。
 * 解析失败或跳回搜索引擎时返回空字符串，调用方应丢弃该结果。
 */
export async function resolveRedirect(value, options = {}) {
  if (!isRedirectShim(value)) return value
  const cacheKey = value
  const cached = redirectCache.get(cacheKey)
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.url

  const context = {
    engine: 'redirect',
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 8000,
  }
  const combo = combineSignals(context.signal, context.timeoutMs)
  try {
    const response = await fetch(value, {
      redirect: 'manual',
      signal: combo.signal,
      headers: requestHeaders(),
    })
    const location = response.headers.get('location')
    if (location) {
      const target = new URL(location, value).href
      if (!isInternalSearchUrl(target)) {
        redirectCache.set(cacheKey, { at: Date.now(), url: target })
        return target
      }
      return ''
    }
    const text = (await response.text()).slice(0, 20000)
    const script =
      /(?:window\.)?location(?:\.href|\.replace|\.assign)?\s*(?:=|\()\s*["']([^"']+)["']/i.exec(text) ??
      /http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i.exec(text)
    if (script?.[1]) {
      const target = decodeEntities(script[1]).replace(/^['"]|['"]$/g, '')
      const absolute = new URL(target, value).href
      if (!isInternalSearchUrl(absolute)) {
        redirectCache.set(cacheKey, { at: Date.now(), url: absolute })
        return absolute
      }
    }
    return ''
  } catch {
    return ''
  } finally {
    combo.dispose()
  }
}

/* ------------------------------------------------------------------ */
/* 聚合与排序                                                           */
/* ------------------------------------------------------------------ */

/**
 * 用加权 Reciprocal Rank Fusion 合并多引擎结果。
 * @param {{engine: string, weight?: number, results: Array<object>}[]} groups
 * @param {{maxResults?: number, query?: string}} options
 */
export function mergeSources(groups, options = {}) {
  const merged = new Map()
  for (const group of groups) {
    const weight = typeof group.weight === 'number' ? group.weight : 1
    group.results.forEach((result, index) => {
      const url = normalizeResultUrl(result.url)
      if (!url || isInternalSearchUrl(url)) return
      const key = canonicalUrl(url)
      if (!key) return
      const title = cleanText(result.title || result.url)
      const snippet = cleanText(result.snippet ?? '')
      const score = weight / (RRF_K + index + 1)
      const existing = merged.get(key)
      if (existing) {
        existing.score += score
        if (!existing.engines.includes(group.engine)) existing.engines.push(group.engine)
        if (snippet.length > existing.snippet.length) existing.snippet = snippet
        if (title.length > existing.title.length) existing.title = title
        if (!existing.publishedAt && result.publishedAt) existing.publishedAt = result.publishedAt
      } else {
        merged.set(key, {
          title,
          url,
          snippet,
          publishedAt: result.publishedAt,
          score,
          engine: group.engine,
          engines: [group.engine],
        })
      }
    })
  }

  const query = cleanText(options.query ?? '').toLowerCase()
  const items = [...merged.values()]
  for (const item of items) {
    // 多引擎共同命中是强相关信号；标题包含查询词再加一点分。
    item.score += Math.max(0, item.engines.length - 1) * 0.004
    if (query && item.title.toLowerCase().includes(query)) item.score += 0.003
    item.score = Math.round(item.score * 1e6) / 1e6
  }
  items.sort((left, right) => right.score - left.score || right.title.length - left.title.length)
  return items.slice(0, Math.max(1, options.maxResults ?? items.length))
}

const searchCache = new Map()
const engineHealth = new Map()

export function clearSearchCache() {
  searchCache.clear()
  redirectCache.clear()
}

/** 最近一次引擎失败，用于 web_engines 和设置页诊断。 */
export function getEngineHealth() {
  return Object.fromEntries([...engineHealth.entries()].map(([id, value]) => [id, { ...value }]))
}

export function getSearchCacheStats() {
  return { entries: searchCache.size, redirects: redirectCache.size }
}

function cacheGet(key, ttl) {
  if (ttl <= 0) return undefined
  const entry = searchCache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.at > ttl) {
    searchCache.delete(key)
    return undefined
  }
  return entry.results
}

function cacheSet(key, results, ttl) {
  if (ttl <= 0) return
  if (searchCache.size > 300) {
    const oldest = searchCache.keys().next().value
    if (oldest !== undefined) searchCache.delete(oldest)
  }
  searchCache.set(key, { at: Date.now(), results, ttl })
}

function pickEngines(config, env, engineIds, maxEngines) {
  const requested = Array.isArray(engineIds) && engineIds.length > 0 ? engineIds : null
  const candidates = requested
    ? ENGINE_CATALOG.filter((engine) => requested.includes(engine.id))
    : ENGINE_CATALOG
  const available = candidates.filter((engine) => engineAvailable(engine.id, config, env))
  return available.slice(0, Math.max(1, maxEngines))
}

/**
 * 在多个引擎上检索一个 query。
 * @param {string} query
 * @param {{
 *   config: object, env?: object, signal?: AbortSignal,
 *   engineIds?: string[], maxResults?: number,
 *   resultsPerEngine?: number, timeoutMs?: number,
 *   useCache?: boolean,
 * }} options
 * @returns {Promise<{sources: object[], engines: string[], warnings: object[], timings: object}>}
 */
export async function searchWithEngines(query, options) {
  const totalTimeoutMs = Math.max(
    5000,
    options.totalTimeoutMs ?? options.config?.search?.totalTimeoutMs ?? 30000,
  )
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`整次搜索超时（${totalTimeoutMs}ms）`)), totalTimeoutMs)
  const external = options.signal
  const onAbort = () => controller.abort(external?.reason)
  if (external?.aborted) controller.abort(external.reason)
  else external?.addEventListener('abort', onAbort, { once: true })
  try {
    return await runSearch(query, options, controller.signal)
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', onAbort)
  }
}

async function runSearch(query, options, signal) {
  const text = String(query ?? '').trim()
  if (!text) return { sources: [], engines: [], warnings: [], timings: {} }

  const config = options.config
  const env = options.env ?? process.env
  const resultsPerEngine = Math.max(1, options.resultsPerEngine ?? config.search.resultsPerEngine)
  const maxEngines = options.maxEngines ?? config.search.maxEnginesPerQuery
  const timeoutMs = options.timeoutMs ?? config.search.engineTimeoutMs
  const ttl = config.search.cacheTtlMs
  const selected = pickEngines(config, env, options.engineIds, maxEngines)
  const groups = []
  const warnings = []
  const timings = {}

  await Promise.all(
    selected.map(async (catalog) => {
      const engine = config.engines[catalog.id]
      const key = `${catalog.id}:${text}:${resultsPerEngine}`
      const started = Date.now()
      const cached = options.useCache === false ? undefined : cacheGet(key, ttl)
      if (cached) {
        engineHealth.delete(catalog.id)
        groups.push({ engine: catalog.id, weight: engine.weight, results: cached })
        timings[catalog.id] = { ms: 0, cached: true, count: cached.length }
        return
      }
      try {
        const runner = RUNNERS[catalog.id]
        if (!runner) throw new EngineError(catalog.id, '未实现的引擎')
        const results = await runner(text, engine, {
          engine: catalog.id,
          config,
          env,
          signal,
          timeoutMs,
          resultsPerEngine,
          webFetch: options.webFetch,
        })
        const cleaned = results
          .map((item) => ({ ...item, url: normalizeResultUrl(item.url), title: cleanText(item.title) }))
          .filter((item) => item.url && item.title && !isInternalSearchUrl(item.url))
        engineHealth.delete(catalog.id)
        groups.push({ engine: catalog.id, weight: engine.weight, results: cleaned })
        cacheSet(key, cleaned, ttl)
        timings[catalog.id] = { ms: Date.now() - started, cached: false, count: cleaned.length }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        engineHealth.set(catalog.id, { at: Date.now(), message })
        warnings.push({ engine: catalog.id, message })
        timings[catalog.id] = { ms: Date.now() - started, error: message, count: 0 }
      }
    }),
  )

  let sources = mergeSources(groups, {
    query: text,
    maxResults: Math.max(1, options.maxResults ?? resultsPerEngine * 3),
  })

  // 搜狗/360/百度的跳转壳需要一次额外请求才能拿到真实域名。
  const redirectCandidates = sources.filter((item) => isRedirectShim(item.url)).slice(0, 12)
  if (redirectCandidates.length > 0) {
    await Promise.all(
      redirectCandidates.map(async (item) => {
        const resolved = await resolveRedirect(item.url, { signal, timeoutMs })
        if (resolved) item.url = resolved
        else item.dead = true
      }),
    )
    sources = sources.filter((item) => !item.dead)
    const seen = new Set()
    sources = sources.filter((item) => {
      const key = canonicalUrl(item.url)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  return {
    sources,
    engines: selected.map((engine) => engine.id),
    warnings,
    timings,
  }
}
