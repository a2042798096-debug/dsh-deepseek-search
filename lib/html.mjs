/**
 * DeepSeek 搜索 —— 轻量网页正文提取。
 *
 * 目标不是完整还原 DOM，而是从常见文章页（新闻、博客、公众号、GitHub、
 * 知乎、CSDN 等）中稳定拿到可读正文，并给出标题、摘要、发布时间、链接。
 * 不依赖任何第三方 HTML 解析库。
 */
import { decodeEntities, extractDate, stripTags } from './engines.mjs'

const BLOCK_END = /<\/(?:p|div|section|article|main|li|tr|h[1-6]|blockquote|pre|table|ul|ol|dl|dd|dt|figure|figcaption)>/gi
const REMOVE_ELEMENTS =
  /<(script|style|noscript|template|svg|canvas|iframe|object|embed|form|input|select|textarea|button|nav|header|footer|aside|menu|dialog)\b[\s\S]*?<\/\1>/gi

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match) return match
  }
  return null
}

function metaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ]
  const match = firstMatch(html, patterns)
  return match ? decodeEntities(match[1]).trim() : ''
}

function balancedElement(html, startIndex, tagName) {
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi')
  tagPattern.lastIndex = startIndex
  let depth = 0
  let match
  while ((match = tagPattern.exec(html))) {
    const token = match[0]
    if (/^<\//.test(token)) depth -= 1
    else if (!/\/>$/.test(token)) depth += 1
    if (depth === 0) return html.slice(startIndex, tagPattern.lastIndex)
  }
  return html.slice(startIndex)
}

/**
 * 从起始标签位置取出一个平衡的 HTML 片段。
 * @param {string} html
 * @param {RegExp} opener 必须能匹配到开始标签
 * @param {string} tagName
 */
function collectCandidates(html) {
  const selectors = [
    { re: /<div[^>]+id=["']js_content["'][^>]*>/gi, tag: 'div', bonus: 1500, name: 'wechat' },
    { re: /<div[^>]+id=["']content_views["'][^>]*>/gi, tag: 'div', bonus: 1300, name: 'csdn' },
    { re: /<div[^>]+class=["'][^"']*\bRichText\b[^"']*["'][^>]*>/gi, tag: 'div', bonus: 1200, name: 'zhihu' },
    { re: /<article[^>]*class=["'][^"']*\bmarkdown-body\b[^"']*["'][^>]*>/gi, tag: 'article', bonus: 1200, name: 'github' },
    { re: /<article\b[^>]*>/gi, tag: 'article', bonus: 800, name: 'article' },
    { re: /<main\b[^>]*>/gi, tag: 'main', bonus: 600, name: 'main' },
    { re: /<div[^>]+role=["']main["'][^>]*>/gi, tag: 'div', bonus: 500, name: 'role-main' },
  ]

  const candidates = []
  for (const selector of selectors) {
    selector.re.lastIndex = 0
    let match
    while ((match = selector.re.exec(html))) {
      candidates.push({
        name: selector.name,
        bonus: selector.bonus,
        html: balancedElement(html, match.index, selector.tag),
      })
      if (candidates.length > 40) break
    }
  }

  const body = /<body\b[^>]*>/i.exec(html)
  if (body) {
    candidates.push({
      name: 'body',
      bonus: 0,
      html: balancedElement(html, body.index, 'body'),
    })
  } else {
    candidates.push({ name: 'document', bonus: 0, html })
  }
  return candidates
}

function linkTextLength(fragment) {
  let total = 0
  const pattern = /<a\b[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = pattern.exec(fragment))) total += stripTags(match[1]).length
  return total
}

function htmlToText(fragment) {
  let html = String(fragment ?? '')
  html = html.replace(/<!--[\s\S]*?-->/g, '')
  html = html.replace(REMOVE_ELEMENTS, ' ')
  html = html.replace(/<br\s*\/?>/gi, '\n')
  html = html.replace(/<hr\b[^>]*>/gi, '\n\n')
  html = html.replace(/<li\b[^>]*>/gi, '\n- ')
  html = html.replace(/<h([1-6])\b[^>]*>/gi, (_, level) => `\n\n${'#'.repeat(Number(level))} `)
  html = html.replace(/<blockquote\b[^>]*>/gi, '\n\n> ')
  html = html.replace(/<td\b[^>]*>/gi, ' | ')
  html = html.replace(/<th\b[^>]*>/gi, ' | ')
  html = html.replace(BLOCK_END, '\n')
  html = html.replace(/<[^>]+>/g, ' ')
  html = decodeEntities(html)
  html = html.replace(/\r\n?/g, '\n')
  html = html.replace(/[\u00a0\u3000\u200b]/g, ' ')
  html = html.replace(/[ \t\f\v]+/g, ' ')
  html = html.replace(/ *\n */g, '\n')
  html = html.replace(/\n{3,}/g, '\n\n')
  return html.trim()
}

const BOILERPLATE_LINE =
  /^(?:首页|登录|注册|搜索|更多|相关推荐|广告|分享|收藏|评论|点赞|上一篇|下一篇|返回顶部|版权所有|Copyright|All Rights Reserved|Sign in|Log in|Read more|Share)$/i

function cleanupText(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (line === '') return true
      if (line.length <= 24 && BOILERPLATE_LINE.test(line)) return false
      if (/^(?:来源|编辑|责任编辑|作者)[:：]\s*$/.test(line)) return false
      return true
    })
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function extractLinks(fragment, baseURL) {
  const links = []
  const seen = new Set()
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = pattern.exec(fragment)) && links.length < 60) {
    const text = stripTags(match[2]).slice(0, 120)
    let url
    try {
      url = new URL(decodeEntities(match[1]), baseURL)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    url.hash = ''
    const href = url.href
    if (seen.has(href)) continue
    seen.add(href)
    links.push({ url: href, text })
  }
  return links
}

function countWords(text) {
  const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length
  const latin = (text.match(/[A-Za-z0-9]+/g) ?? []).length
  return chinese + latin
}

function clipContent(text, maxChars) {
  if (text.length <= maxChars) return { content: text, truncated: false }
  let cut = text.slice(0, maxChars)
  const boundary = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('。'), cut.lastIndexOf('. '))
  if (boundary > maxChars * 0.6) cut = cut.slice(0, boundary + 1)
  return { content: cut.trim(), truncated: true }
}

/**
 * 提取网页正文。
 * @param {string} html
 * @param {string} url
 * @param {{maxChars?: number, includeLinks?: boolean}} options
 */
export function extractPage(html, url, options = {}) {
  const source = String(html ?? '')
  const maxChars = Math.max(500, options.maxChars ?? 12000)

  const title =
    metaContent(source, 'og:title') ||
    stripTags(firstMatch(source, [/<title\b[^>]*>([\s\S]*?)<\/title>/i])?.[1] ?? '') ||
    stripTags(firstMatch(source, [/<h1\b[^>]*>([\s\S]*?)<\/h1>/i])?.[1] ?? '')
  const description =
    metaContent(source, 'description') || metaContent(source, 'og:description')
  const canonical = firstMatch(source, [/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i])?.[1]
  const publishedAt =
    metaContent(source, 'article:published_time') ||
    metaContent(source, 'datePublished') ||
    metaContent(source, 'pubdate') ||
    firstMatch(source, [/<time\b[^>]*datetime=["']([^"']+)["']/i])?.[1] ||
    undefined
  const siteName = metaContent(source, 'og:site_name') || safeHostname(url)

  const candidates = collectCandidates(source)
  let best = null
  for (const candidate of candidates) {
    const text = htmlToText(candidate.html)
    const score = text.length - linkTextLength(candidate.html) * 1.4 + candidate.bonus
    if (!best || score > best.score) best = { ...candidate, text, score }
  }

  let content = cleanupText(best?.text ?? '')
  if (content.length < 200) {
    const fallback = cleanupText(htmlToText(source))
    if (fallback.length > content.length) content = fallback
  }
  if (content.length === 0) content = stripTags(source)

  const clipped = clipContent(content, maxChars)
  const links = options.includeLinks ? extractLinks(best?.html ?? source, url).slice(0, 40) : []

  return {
    title: title || safeHostname(url),
    description,
    canonicalUrl: canonical ? decodeEntities(canonical) : url,
    publishedAt: publishedAt || extractDate(content),
    siteName,
    content: clipped.content,
    excerpt: clipped.content.slice(0, 280),
    contentChars: clipped.content.length,
    wordCount: countWords(clipped.content),
    truncated: clipped.truncated,
    lowContent: clipped.content.length < 200,
    links,
  }
}

function safeHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
