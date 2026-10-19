/**
 * DeepSeek 搜索插件 —— 配置模型、默认值、持久化与脱敏。
 *
 * 配置文件默认位于 $DSH_HOME/deepseek-search/config.json（Windows 通常是
 * C:\Users\<name>\.dsh\deepseek-search\config.json）。API Key 只写入该文件，
 * 不会出现在日志、工具返回值或设置页的回显中。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 引擎目录：顺序即设置页展示顺序。 */
export const ENGINE_CATALOG = [
  {
    id: 'bing',
    label: '必应 Bing',
    kind: 'free',
    region: 'cn',
    needsKey: false,
    defaultEnabled: true,
    description: '国内可直连的必应中文结果，免密钥。',
    keyEnv: null,
  },
  {
    id: 'baidu',
    label: '百度',
    kind: 'free',
    region: 'cn',
    needsKey: false,
    defaultEnabled: true,
    description: '百度网页结果，中文资料覆盖好，免密钥。',
    keyEnv: null,
  },
  {
    id: 'sogou',
    label: '搜狗',
    kind: 'free',
    region: 'cn',
    needsKey: false,
    defaultEnabled: true,
    description: '搜狗网页结果，微信公众号内容较多，免密钥。',
    keyEnv: null,
  },
  {
    id: 'so360',
    label: '360 搜索',
    kind: 'free',
    region: 'cn',
    needsKey: false,
    defaultEnabled: true,
    description: '360 网页结果，作为中文结果的补充，免密钥。',
    keyEnv: null,
  },
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    kind: 'free',
    region: 'global',
    needsKey: false,
    defaultEnabled: false,
    description: '国际结果，免密钥；中国大陆通常需要代理，默认关闭。',
    keyEnv: null,
  },
  {
    id: 'searxng',
    label: 'SearXNG',
    kind: 'custom',
    region: 'global',
    needsKey: false,
    defaultEnabled: false,
    description: '自建或可用的 SearXNG 实例，需填写以 http(s):// 开头的地址。',
    keyEnv: null,
  },
  {
    id: 'tavily',
    label: 'Tavily',
    kind: 'api',
    region: 'global',
    needsKey: true,
    defaultEnabled: false,
    description: '为 AI 优化的搜索 API，免费额度较充足，需 API Key。',
    keyEnv: 'TAVILY_API_KEY',
  },
  {
    id: 'exa',
    label: 'Exa',
    kind: 'api',
    region: 'global',
    needsKey: true,
    defaultEnabled: false,
    description: '语义搜索 API，适合技术资料与论文，需 API Key。',
    keyEnv: 'EXA_API_KEY',
  },
  {
    id: 'firecrawl',
    label: 'Firecrawl',
    kind: 'api',
    region: 'global',
    needsKey: true,
    defaultEnabled: false,
    description: '搜索 + 抓取能力，需 API Key。',
    keyEnv: 'FIRECRAWL_API_KEY',
  },
  {
    id: 'brave',
    label: 'Brave Search',
    kind: 'api',
    region: 'global',
    needsKey: true,
    defaultEnabled: false,
    description: '独立索引的搜索 API，需 API Key。',
    keyEnv: 'BRAVE_API_KEY',
  },
  {
    id: 'serper',
    label: 'Serper (Google)',
    kind: 'api',
    region: 'global',
    needsKey: true,
    defaultEnabled: false,
    description: '通过 Serper 调用 Google 结果，需 API Key。',
    keyEnv: 'SERPER_API_KEY',
  },
]

export const ENGINE_IDS = ENGINE_CATALOG.map((engine) => engine.id)

/** 默认配置。 */
export function defaultConfig() {
  const engines = {}
  for (const engine of ENGINE_CATALOG) {
    engines[engine.id] = {
      enabled: engine.defaultEnabled,
      weight: defaultWeight(engine.id),
      baseURL: engine.id === 'bing' ? 'https://cn.bing.com' : '',
      apiKey: '',
    }
  }
  return {
    version: 1,
    engines,
    search: {
      resultsPerEngine: 10,
      engineTimeoutMs: 15000,
      totalTimeoutMs: 30000,
      maxEnginesPerQuery: 6,
      cacheTtlMs: 180000,
    },
    fetch: {
      maxCharsPerPage: 12000,
      researchMaxPages: 6,
      concurrency: 3,
      readerBaseURL: '',
    },
    ui: {
      language: 'zh',
    },
  }
}

function defaultWeight(id) {
  switch (id) {
    case 'bing':
      return 1
    case 'baidu':
      return 0.95
    case 'sogou':
      return 0.85
    case 'so360':
      return 0.8
    case 'duckduckgo':
    case 'searxng':
      return 0.9
    case 'tavily':
      return 1.1
    case 'exa':
    case 'serper':
      return 1.05
    default:
      return 1
  }
}

const NUMBER_RULES = {
  'search.resultsPerEngine': { min: 1, max: 20, integer: true },
  'search.engineTimeoutMs': { min: 3000, max: 30000, integer: true },
  'search.totalTimeoutMs': { min: 5000, max: 60000, integer: true },
  'search.maxEnginesPerQuery': { min: 1, max: 11, integer: true },
  'search.cacheTtlMs': { min: 0, max: 3600000, integer: true },
  'fetch.maxCharsPerPage': { min: 1000, max: 50000, integer: true },
  'fetch.researchMaxPages': { min: 1, max: 10, integer: true },
  'fetch.concurrency': { min: 1, max: 6, integer: true },
}

function clampNumber(value, rule) {
  if (typeof value === 'string' && value.trim() === '') return undefined
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  const rounded = rule.integer ? Math.round(number) : number
  return Math.min(rule.max, Math.max(rule.min, rounded))
}

function normalizeURLString(value) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 500)
}

function isHTTPURL(value) {
  if (value === '') return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 把任意输入规整成完整、可用的配置。
 * @param {unknown} input
 * @returns {{config: ReturnType<typeof defaultConfig>, warnings: string[]}}
 */
export function normalizeConfig(input) {
  const config = defaultConfig()
  const warnings = []
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { config, warnings: input === undefined ? warnings : ['配置不是 JSON 对象，已使用默认值。'] }
  }

  const engines = input.engines
  if (engines !== null && typeof engines === 'object' && !Array.isArray(engines)) {
    for (const engine of ENGINE_CATALOG) {
      const source = engines[engine.id]
      if (source === null || typeof source !== 'object' || Array.isArray(source)) continue
      const target = config.engines[engine.id]
      if (typeof source.enabled === 'boolean') target.enabled = source.enabled
      if (typeof source.weight === 'number' && Number.isFinite(source.weight)) {
        target.weight = Math.min(3, Math.max(0.1, source.weight))
      }
      if (typeof source.baseURL === 'string') {
        const baseURL = normalizeURLString(source.baseURL)
        if (engine.id === 'bing' && baseURL === '') {
          target.baseURL = 'https://cn.bing.com'
        } else if (isHTTPURL(baseURL)) {
          target.baseURL = baseURL
        } else {
          warnings.push(`${engine.label} 的地址不是 http(s) URL，已忽略。`)
        }
      }
      if (typeof source.apiKey === 'string') {
        target.apiKey = source.apiKey.trim().slice(0, 500)
      }
    }
  }

  for (const [dotted, rule] of Object.entries(NUMBER_RULES)) {
    const [section, key] = dotted.split('.')
    const raw = input[section]?.[key]
    if (raw === undefined) continue
    const value = clampNumber(raw, rule)
    if (value === undefined) {
      warnings.push(`${section}.${key} 不是有效数字，已使用默认值。`)
    } else {
      config[section][key] = value
    }
  }

  if (typeof input.fetch?.readerBaseURL === 'string') {
    const readerBaseURL = normalizeURLString(input.fetch.readerBaseURL)
    if (isHTTPURL(readerBaseURL)) config.fetch.readerBaseURL = readerBaseURL
    else warnings.push('阅读器地址不是 http(s) URL，已忽略。')
  }
  if (input.ui?.language === 'en' || input.ui?.language === 'zh') {
    config.ui.language = input.ui.language
  }

  // 不允许所有引擎都被关掉：保留至少 Bing，避免 web_search 直接不可用。
  if (!ENGINE_IDS.some((id) => config.engines[id].enabled)) {
    config.engines.bing.enabled = true
    warnings.push('所有引擎都被关闭，已自动保留必应 Bing。')
  }

  return { config, warnings }
}

/**
 * 合并设置页提交的补丁。只接受已知字段，API Key 单独处理。
 * @param {ReturnType<typeof defaultConfig>} current
 * @param {unknown} incoming
 * @param {Record<string, string|null|undefined>} keys
 * @returns {{config: ReturnType<typeof defaultConfig>, warnings: string[]}}
 */
export function applyConfigPatch(current, incoming, keys = {}) {
  const merged = structuredClone(current)
  const patch = incoming !== null && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {}

  if (patch.engines !== null && typeof patch.engines === 'object' && !Array.isArray(patch.engines)) {
    for (const engine of ENGINE_CATALOG) {
      const source = patch.engines[engine.id]
      if (source === null || typeof source !== 'object' || Array.isArray(source)) continue
      const target = merged.engines[engine.id]
      if (typeof source.enabled === 'boolean') target.enabled = source.enabled
      if (typeof source.weight === 'number' && Number.isFinite(source.weight)) {
        target.weight = Math.min(3, Math.max(0.1, source.weight))
      }
      if (typeof source.baseURL === 'string') {
        const baseURL = normalizeURLString(source.baseURL)
        if (engine.id === 'bing' && baseURL === '') target.baseURL = 'https://cn.bing.com'
        else if (isHTTPURL(baseURL)) target.baseURL = baseURL
      }
    }
  }

  for (const [dotted, rule] of Object.entries(NUMBER_RULES)) {
    const [section, key] = dotted.split('.')
    const raw = patch[section]?.[key]
    if (raw === undefined) continue
    const value = clampNumber(raw, rule)
    if (value !== undefined) merged[section][key] = value
  }

  if (typeof patch.fetch?.readerBaseURL === 'string') {
    const readerBaseURL = normalizeURLString(patch.fetch.readerBaseURL)
    if (isHTTPURL(readerBaseURL)) merged.fetch.readerBaseURL = readerBaseURL
  }

  for (const [id, value] of Object.entries(keys ?? {})) {
    if (!ENGINE_IDS.includes(id)) continue
    if (typeof value === 'string') merged.engines[id].apiKey = value.trim().slice(0, 500)
    else if (value === null) merged.engines[id].apiKey = ''
  }

  const { config, warnings } = normalizeConfig(merged)
  return { config, warnings }
}

/** 引擎是否具备运行条件（不看 enabled）。 */
export function engineHasCredential(engine, env = process.env) {
  const configured = engine.apiKey && engine.apiKey.length > 0
  const fromEnv = engine.keyEnv ? Boolean(env?.[engine.keyEnv]) : false
  return Boolean(configured || fromEnv)
}

/** 解析引擎实际使用的 API Key（配置优先，环境变量兜底）。 */
export function resolveEngineKey(id, config, env = process.env) {
  const catalog = ENGINE_CATALOG.find((engine) => engine.id === id)
  if (!catalog?.needsKey) return ''
  const configured = config.engines[id]?.apiKey?.trim()
  if (configured) return configured
  return catalog.keyEnv ? (env?.[catalog.keyEnv] ?? '').trim() : ''
}

/** 引擎是否可用（enabled + 凭据/地址齐全）。 */
export function engineAvailable(id, config, env = process.env) {
  const catalog = ENGINE_CATALOG.find((engine) => engine.id === id)
  const engine = config.engines[id]
  if (!catalog || !engine?.enabled) return false
  if (catalog.needsKey) return resolveEngineKey(id, config, env).length > 0
  if (catalog.kind === 'custom') return Boolean(engine.baseURL)
  return true
}

/** 给设置页/工具用的引擎状态，永不返回明文 Key。 */
export function listEngineStatus(config, env = process.env) {
  return ENGINE_CATALOG.map((catalog) => {
    const engine = config.engines[catalog.id]
    const key = resolveEngineKey(catalog.id, config, env)
    return {
      id: catalog.id,
      label: catalog.label,
      kind: catalog.kind,
      region: catalog.region,
      needsKey: catalog.needsKey,
      keyEnv: catalog.keyEnv ?? '',
      description: catalog.description,
      enabled: Boolean(engine.enabled),
      available: engineAvailable(catalog.id, config, env),
      hasKey: key.length > 0,
      keyPreview: key.length > 0 ? maskKey(key) : '',
      baseURL: engine.baseURL ?? '',
      weight: engine.weight,
    }
  })
}

export function maskKey(key) {
  const text = String(key ?? '')
  if (text.length <= 4) return '••••'
  return `••••${text.slice(-4)}`
}

/** 给设置页的脱敏配置。 */
export function publicConfig(config, env = process.env) {
  const engines = {}
  for (const engine of ENGINE_CATALOG) {
    const value = config.engines[engine.id]
    const key = resolveEngineKey(engine.id, config, env)
    engines[engine.id] = {
      enabled: value.enabled,
      weight: value.weight,
      baseURL: value.baseURL ?? '',
      hasKey: key.length > 0,
      keyPreview: key.length > 0 ? maskKey(key) : '',
    }
  }
  return {
    version: config.version,
    engines,
    search: { ...config.search },
    fetch: { ...config.fetch },
    ui: { ...config.ui },
  }
}

export function resolveConfigPath(env = process.env) {
  const explicit = env?.DSH_DEEPSEEK_SEARCH_CONFIG
  if (typeof explicit === 'string' && explicit.trim() !== '') return path.resolve(explicit)
  const home = env?.DSH_HOME && env.DSH_HOME.trim() !== '' ? env.DSH_HOME : path.join(os.homedir(), '.dsh')
  return path.join(home, 'deepseek-search', 'config.json')
}

/**
 * 读取配置；文件不存在时返回默认值。
 * @returns {{config: ReturnType<typeof defaultConfig>, exists: boolean, warnings: string[], path: string}}
 */
export function loadConfig(filePath = resolveConfigPath(), env = process.env) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    return { config: defaultConfig(), exists: false, warnings: [], path: resolved }
  }
  try {
    const raw = fs.readFileSync(resolved, 'utf8')
    const parsed = raw.trim() === '' ? {} : JSON.parse(raw)
    const { config, warnings } = normalizeConfig(parsed)
    return { config, exists: true, warnings, path: resolved }
  } catch (error) {
    return {
      config: defaultConfig(),
      exists: true,
      warnings: [`配置文件无法解析（${error.message}），本次使用默认值。`],
      path: resolved,
    }
  }
}

/** 原子写入配置；Windows 上 rename 覆盖已存在文件，失败时回退到直接写。 */
export function saveConfig(filePath, config, env = process.env) {
  const resolved = path.resolve(filePath)
  const dir = path.dirname(resolved)
  fs.mkdirSync(dir, { recursive: true })
  const text = `${JSON.stringify(config, null, 2)}\n`
  const temporary = `${resolved}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.renameSync(temporary, resolved)
  } catch {
    fs.writeFileSync(resolved, text, { encoding: 'utf8', mode: 0o600 })
    try {
      fs.rmSync(temporary, { force: true })
    } catch {
      /* 忽略清理失败 */
    }
  }
  try {
    fs.chmodSync(resolved, 0o600)
  } catch {
    /* Windows 权限位不适用 */
  }
  return resolved
}
