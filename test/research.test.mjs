/**
 * 深度收集冒烟测试（真实网络 + 模拟 ctx.web）：
 *   node test/research.test.mjs
 */
import { defaultConfig } from '../lib/config.mjs'
import { collectUrls, formatCollect, formatResearch, researchTopic } from '../lib/research.mjs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const ctx = {
  web: {
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
}

const config = defaultConfig()
config.fetch.concurrency = 3
config.fetch.maxCharsPerPage = 3000

console.log('== researchTopic ==')
const research = await researchTopic(
  ctx,
  { query: 'DeepSeek Harness 插件', depth: 'quick', maxPages: 3 },
  { config },
)
console.log({
  ok: research.ok,
  queries: research.queries,
  engines: research.engines,
  pages: research.results.length,
  failures: research.failures.length,
  elapsedMs: research.elapsedMs,
})
for (const item of research.results) {
  console.log(`- ${item.title} | ${item.url} | ${item.contentChars} chars`)
}
const rendered = formatResearch(research)
console.log('rendered chars:', rendered.length)
console.log(rendered.slice(0, 800))

if (research.results.length === 0) {
  console.error('没有抓到任何页面')
  process.exitCode = 1
}

console.log('\n== collectUrls ==')
const collected = await collectUrls(
  ctx,
  ['https://example.com', 'https://deepseek-harness-plugin.com/zh-CN/'],
  { config, maxChars: 1500 },
)
console.log({ pages: collected.pages.length, failures: collected.failures, elapsedMs: collected.elapsedMs })
console.log(formatCollect({ ok: true, ...collected }).slice(0, 600))

if (collected.pages.length === 0) {
  console.error('批量抓取没有成功页面')
  process.exitCode = 1
}
