/**
 * Host 半集成测试：用内存里的假 ctx 和 defineTool 桩加载 lib/index.mjs，
 * 验证工具注册、搜索提供方、深度收集和设置页路由。
 *   node test/host.test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const stub = pathToFileURL(path.join(here, 'stub-dsh-tools.mjs')).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') return { url: stub, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const { apply } = await import('../lib/index.mjs')
const { defaultConfig } = await import('../lib/config.mjs')

const sandbox = path.join(here, '.host-sandbox')
fs.rmSync(sandbox, { recursive: true, force: true })
fs.mkdirSync(sandbox, { recursive: true })
const configPath = path.join(sandbox, 'config.json')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const registered = { tools: [], providers: [], routes: [] }
const ctx = {
  effect(factory) {
    return factory()
  },
  web: {
    registerSearchProvider(provider) {
      registered.providers.push(provider)
      return () => {}
    },
    async fetch({ url }, signal) {
      const response = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
        signal,
      })
      return {
        url: response.url,
        statusCode: response.status,
        body: { kind: 'html', content: await response.text() },
        truncated: false,
      }
    },
    async search() {
      return { sources: [], truncated: false }
    },
  },
  tools: {
    register(tool) {
      registered.tools.push(tool)
    },
  },
  webServer: {
    register(route) {
      registered.routes.push(route)
      return () => {}
    },
  },
}

apply(ctx, { configPath })

console.log('tools:', registered.tools.map((tool) => tool.name).join(', '))
console.log('providers:', registered.providers.map((provider) => provider.id).join(', '))
console.log('routes:', registered.routes.map((route) => `${route.kind}:${route.path}`).join(', '))

if (registered.tools.length !== 3) throw new Error('应注册 3 个工具')
if (registered.providers[0]?.id !== 'deepseek-search') throw new Error('搜索提供方 id 不正确')

const provider = registered.providers[0]
console.log('provider.available:', provider.available())
const searched = await provider.search({ query: 'DeepSeek Harness 插件', maxResults: 5 })
console.log('provider sources:', searched.sources.length)
if (searched.sources.length === 0) throw new Error('提供方没有返回结果')

const tools = new Map(registered.tools.map((tool) => [tool.name, tool]))
const research = await tools.get('web_research').execute(
  { query: 'DeepSeek Harness 插件', depth: 'quick', maxPages: 2 },
  { signal: new AbortController().signal },
)
console.log('web_research:', { ok: research.ok, pages: research.results?.length, failures: research.failures?.length })
if (!research.ok || research.results.length === 0) throw new Error('web_research 执行失败')

const collect = await tools.get('web_collect').execute(
  { urls: ['https://example.com'], maxCharsPerPage: 1000 },
  { signal: new AbortController().signal },
)
console.log('web_collect:', { ok: collect.ok, pages: collect.pages?.length })
if (!collect.ok || collect.pages.length !== 1) throw new Error('web_collect 执行失败')

const engines = await tools.get('web_engines').execute({}, { signal: new AbortController().signal })
console.log('web_engines:', engines.engines.length, 'engines')
if (!engines.ok || engines.engines.length < 4) throw new Error('web_engines 执行失败')

async function callRoute(method, url, body) {
  const route = registered.routes[0]
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const request = Readable.from(chunks)
  request.method = method
  request.url = url
  request.headers = { 'content-type': 'application/json' }
  let statusCode = 0
  let payload = ''
  const response = {
    headersSent: false,
    writeHead(code) {
      statusCode = code
      this.headersSent = true
    },
    end(value) {
      payload += value ?? ''
    },
  }
  await route.handler(request, response)
  return { statusCode, data: payload ? JSON.parse(payload) : null }
}

const configResponse = await callRoute('GET', '/deepseek-search/config')
console.log('GET config:', configResponse.statusCode, configResponse.data?.ok, configResponse.data?.engines?.length)
if (configResponse.statusCode !== 200 || !configResponse.data?.ok) throw new Error('GET config 失败')

const saved = await callRoute('POST', '/deepseek-search/config', {
  config: { search: { resultsPerEngine: 9 }, engines: { tavily: { enabled: true } } },
  keys: { tavily: 'test-key-not-real' },
})
console.log('POST config:', saved.statusCode, saved.data?.ok, saved.data?.config?.search?.resultsPerEngine)
if (!saved.data?.ok) throw new Error('POST config 失败')
if (saved.data.config.search.resultsPerEngine !== 9) throw new Error('设置没有生效')
if (saved.data.config.engines.tavily.hasKey !== true) throw new Error('API Key 没有保存')
if (JSON.stringify(saved.data).includes('test-key-not-real')) throw new Error('响应泄露了明文 Key')

const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'))
console.log('config on disk:', { tavilyEnabled: onDisk.engines.tavily.enabled, keySaved: Boolean(onDisk.engines.tavily.apiKey) })
if (!onDisk.engines.tavily.enabled || onDisk.engines.tavily.apiKey !== 'test-key-not-real') {
  throw new Error('配置文件内容不正确')
}

const tested = await callRoute('POST', '/deepseek-search/test', { query: 'DeepSeek Harness' })
console.log('POST test:', tested.statusCode, tested.data?.results?.length)
if (tested.statusCode !== 200 || !tested.data?.ok) throw new Error('试搜失败')

fs.rmSync(sandbox, { recursive: true, force: true })
console.log('\nHOST TEST PASSED')
