/**
 * 真实网络冒烟测试（不依赖 DSH 运行时）：
 *   node test/engines.test.mjs [query]
 * 只测试默认启用的四个免费引擎，以及可选的 API 引擎配置状态。
 */
import { defaultConfig, listEngineStatus } from '../lib/config.mjs'
import { searchWithEngines, parseBing, parseBaidu, parseSogou, parseSo360 } from '../lib/engines.mjs'

const query = process.argv.slice(2).join(' ') || 'DeepSeek Harness 插件'
const config = defaultConfig()

console.log('query:', query)
console.log(
  'engines:',
  listEngineStatus(config)
    .filter((engine) => engine.available)
    .map((engine) => engine.id)
    .join(', '),
)

const started = Date.now()
const result = await searchWithEngines(query, {
  config,
  maxResults: 12,
  resultsPerEngine: 8,
})
console.log(`elapsed: ${Date.now() - started}ms`)
console.log('timings:', JSON.stringify(result.timings))
if (result.warnings.length > 0) console.log('warnings:', JSON.stringify(result.warnings, null, 2))
console.log(`sources: ${result.sources.length}`)
for (const [index, item] of result.sources.entries()) {
  console.log(`\n${index + 1}. [${item.engines.join('+')}] ${item.title}`)
  console.log(`   ${item.url}`)
  if (item.snippet) console.log(`   ${item.snippet.slice(0, 160)}`)
}

if (result.sources.length === 0) {
  console.error('\n没有拿到任何结果：检查网络或引擎解析。')
  process.exitCode = 1
}

// 解析器自身的快速断言：空输入不应抛错。
for (const parser of [parseBing, parseBaidu, parseSogou, parseSo360]) {
  const empty = parser('')
  if (!Array.isArray(empty) || empty.length !== 0) throw new Error('空 HTML 解析结果应为空数组')
}
