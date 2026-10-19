/**
 * 网页正文提取冒烟测试：
 *   node test/extract.test.mjs
 * 网络站点可能偶发超时；这里把网络失败记为警告，只要求至少一页成功。
 */
import { extractPage } from '../lib/html.mjs'

const urls = [
  'https://example.com',
  'https://deepseek-harness-plugin.com/zh-CN/',
  'https://blog.csdn.net/2301_81024796/article/details/163823565',
  'https://github.com/libukai/awesome-deepseek-harness',
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

let success = 0
for (const url of urls) {
  process.stdout.write(`\n== ${url}\n`)
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(20000),
    })
    const html = await response.text()
    const page = extractPage(html, url, { maxChars: 4000, includeLinks: true })
    console.log({
      status: response.status,
      title: page.title,
      site: page.siteName,
      chars: page.contentChars,
      words: page.wordCount,
      truncated: page.truncated,
      lowContent: page.lowContent,
      publishedAt: page.publishedAt,
      links: page.links.length,
    })
    console.log('--- excerpt ---')
    console.log(page.content.slice(0, 500))
    if (page.contentChars > 0) success += 1
  } catch (error) {
    console.log('WARN 网络失败，跳过:', String(error))
  }
}

if (success === 0) {
  console.error('所有页面都抓取失败，检查网络')
  process.exitCode = 1
} else {
  console.log(`\nEXTRACT TEST PASSED (${success}/${urls.length})`)
}
