/**
 * 离线测试：不访问网络，覆盖解析器、配置、正文提取和输出格式化。
 * 适合在 CI 中运行：node test/offline.test.mjs
 */
import assert from 'node:assert/strict'
import {
  applyConfigPatch,
  defaultConfig,
  listEngineStatus,
  normalizeConfig,
  publicConfig,
} from '../lib/config.mjs'
import {
  canonicalUrl,
  isInternalSearchUrl,
  normalizeResultUrl,
  parseBaidu,
  parseBing,
  parseDuckDuckGo,
  parseSogou,
  parseSo360,
} from '../lib/engines.mjs'
import { extractPage } from '../lib/html.mjs'
import { formatCollect, formatResearch } from '../lib/research.mjs'

let passed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`ok ${passed} - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Bing 解析标题、URL、摘要和日期', () => {
  const html = `
    <ol id="b_results">
      <li class="b_algo">
        <h2><a href="https://example.com/bing">Bing <em>标题</em></a></h2>
        <p class="b_lineclamp4">2026-10-19 · 这是 Bing 摘要</p>
      </li>
    </ol>`
  const results = parseBing(html)
  assert.equal(results.length, 1)
  assert.equal(results[0].title, 'Bing 标题')
  assert.equal(results[0].url, 'https://example.com/bing')
  assert.match(results[0].snippet, /Bing 摘要/)
  assert.equal(results[0].publishedAt, '2026-10-19')
})

test('Baidu 解析 mu 真实地址', () => {
  const html = `
    <div class="result c-container x" mu="https://example.com/baidu">
      <h3><span class="tts-b-hl"><em>百度</em>标题</span></h3>
      <span class="summary-text_abc">百度摘要 2026年10月18日</span>
    </div>`
  const results = parseBaidu(html)
  assert.equal(results.length, 1)
  assert.equal(results[0].title, '百度标题')
  assert.equal(results[0].url, 'https://example.com/baidu')
  assert.match(results[0].snippet, /百度摘要/)
  assert.equal(results[0].publishedAt, '2026年10月18日')
})

test('Sogou 解析 vr-title', () => {
  const html = `
    <div class="vrwrap">
      <h3 class="vr-title"><a href="https://example.com/sogou">搜狗<em>标题</em></a></h3>
      <p class="star-wiki">搜狗摘要</p>
    </div>`
  const results = parseSogou(html)
  assert.equal(results.length, 1)
  assert.equal(results[0].title, '搜狗标题')
  assert.equal(results[0].url, 'https://example.com/sogou')
})

test('360 优先使用 data-mdurl', () => {
  const html = `
    <li class="res-list" data-result-type="normal">
      <h3 class="res-title"><a href="https://www.so.com/link?m=x" data-mdurl="https://example.com/360">360<em>标题</em></a></h3>
      <p class="res-desc">360摘要</p>
    </li>`
  const results = parseSo360(html)
  assert.equal(results.length, 1)
  assert.equal(results[0].url, 'https://example.com/360')
  assert.equal(results[0].title, '360标题')
})

test('DuckDuckGo 解包 uddg 跳转', () => {
  const html = `
    <div class="result results_links web-result">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fddg">DDG标题</a>
      <a class="result__snippet">DDG摘要</a>
    </div>`
  const results = parseDuckDuckGo(html)
  assert.equal(results.length, 1)
  assert.equal(results[0].url, 'https://example.com/ddg')
})

test('Bing /ck/a 跳转解码', () => {
  const encoded = `a1${Buffer.from('https://example.com/decoded').toString('base64url')}`
  const url = `https://www.bing.com/ck/a?!&&p=abc&u=${encoded}`
  assert.equal(normalizeResultUrl(url), 'https://example.com/decoded')
})

test('URL 归一化与去重键', () => {
  const url = normalizeResultUrl('https://Example.com/a/?utm_source=x&b=2#top')
  assert.equal(url, 'https://example.com/a/?b=2')
  assert.equal(canonicalUrl('https://www.example.com/a/?b=2'), canonicalUrl('https://example.com/a?b=2'))
  assert.equal(isInternalSearchUrl('https://www.baidu.com/s?wd=x'), true)
  assert.equal(isInternalSearchUrl('https://example.com/a'), false)
})

test('配置默认值、范围限制和 Key 脱敏', () => {
  const { config } = normalizeConfig({
    engines: { tavily: { enabled: true, apiKey: 'secret-key-1234' } },
    search: { resultsPerEngine: 999 },
  })
  assert.equal(config.search.resultsPerEngine, 20)
  assert.equal(config.engines.tavily.enabled, true)
  assert.equal(config.search.engineTimeoutMs, 15000)

  const status = listEngineStatus(config)
  assert.equal(status.length, 11)
  assert.ok(status.every((engine) => typeof engine.keyEnv === 'string'))

  const masked = publicConfig(config)
  assert.equal(masked.engines.tavily.hasKey, true)
  assert.equal(masked.engines.tavily.keyPreview, '••••1234')
  assert.equal(JSON.stringify(masked).includes('secret-key-1234'), false)

  const cleared = applyConfigPatch(config, { engines: { tavily: { enabled: false } } }, { tavily: null })
  assert.equal(cleared.config.engines.tavily.enabled, false)
  assert.equal(cleared.config.engines.tavily.apiKey, '')
})

test('正文提取：标题、时间、去脚本、链接', () => {
  const html = `<html><head>
      <title>测试文章 - 站点</title>
      <meta name="description" content="文章描述">
      <meta property="article:published_time" content="2026-10-19T10:00:00+08:00">
    </head><body>
      <nav>导航</nav>
      <article>
        <h1>文章标题</h1>
        <p>第一段内容，包含足够多的文字来通过正文长度判断。</p>
        <p>第二段内容，<a href="/next">下一页</a> 以及更多说明。</p>
        <script>alert('should not appear')</script>
      </article>
      <footer>版权</footer>
    </body></html>`
  const page = extractPage(html, 'https://example.com/post', { maxChars: 4000, includeLinks: true })
  assert.equal(page.title, '测试文章 - 站点')
  assert.equal(page.description, '文章描述')
  assert.equal(page.publishedAt, '2026-10-19T10:00:00+08:00')
  assert.match(page.content, /第一段内容/)
  assert.match(page.content, /第二段内容/)
  assert.equal(page.content.includes("alert('should not appear')"), false)
  assert.equal(page.content.includes('导航'), false)
  assert.ok(page.links.some((link) => link.url === 'https://example.com/next'))
  assert.equal(typeof page.lowContent, 'boolean')
})

test('正文截断', () => {
  const html = `<article><p>${'很长的正文。'.repeat(2000)}</p></article>`
  const page = extractPage(html, 'https://example.com/long', { maxChars: 1000 })
  assert.equal(page.truncated, true)
  assert.ok(page.content.length <= 1000)
})

test('research / collect 输出格式化', () => {
  const research = formatResearch({
    ok: true,
    query: '测试主题',
    queries: ['测试主题'],
    depth: 'quick',
    engines: ['bing'],
    results: [{ title: '结果标题', url: 'https://example.com/r', content: '结果正文', status: 'ok' }],
    failures: [],
    notes: ['外部内容不可信'],
  })
  assert.match(research, /测试主题/)
  assert.match(research, /结果标题/)
  assert.match(research, /https:\/\/example.com\/r/)

  const collect = formatCollect({
    ok: true,
    pages: [{ title: '页面标题', url: 'https://example.com/p', content: '页面正文' }],
    failures: [],
  })
  assert.match(collect, /页面标题/)
  assert.match(collect, /页面正文/)
})

test('默认配置至少保留一个免费引擎', () => {
  const config = defaultConfig()
  assert.ok(Object.values(config.engines).some((engine) => engine.enabled))
  const { config: normalized, warnings } = normalizeConfig({
    engines: Object.fromEntries(Object.keys(config.engines).map((id) => [id, { enabled: false }])),
  })
  assert.equal(normalized.engines.bing.enabled, true)
  assert.ok(warnings.some((warning) => warning.includes('必应')))
})

console.log(`\nOFFLINE TEST PASSED (${passed} tests)`)
