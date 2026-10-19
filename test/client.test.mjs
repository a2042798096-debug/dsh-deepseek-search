/**
 * Client bundle 冒烟测试：不启动浏览器，只验证 __ModuleLoader__ 包装、
 * apply() 注入和 settings.section 注册。
 *   node test/client.test.mjs
 */
let definition
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      definition = value
    },
  },
}

await import('../lib/client.js')

if (!definition || definition.id !== 'dsh-deepseek-search') {
  throw new Error('client bundle 没有使用正确的 __ModuleLoader__.load 包装')
}

const React = {
  createElement() {},
  useMemo(factory) {
    return factory()
  },
  useState(value) {
    return [value, () => {}]
  },
  useEffect() {},
}

const client = definition.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

const registered = { sections: [], locales: [] }
const ctx = {
  effect(factory) {
    return factory()
  },
  locale: {
    bind() {
      return (key) => key
    },
    register(namespace, dictionaries) {
      registered.locales.push({ namespace, dictionaries })
    },
  },
  slots: {
    inject(name, callback) {
      if (name !== 'settings.section') throw new Error(`unexpected slot: ${name}`)
      return callback()
    },
    register(options, component) {
      registered.sections.push({ options, component })
      return () => {}
    },
  },
}

client.apply(ctx)
console.log('inject:', client.inject)
console.log('locales:', registered.locales.map((item) => item.namespace))
console.log('sections:', registered.sections.map((item) => item.options.id))
if (client.inject.join(',') !== 'slots,locale') throw new Error('client inject 不正确')
if (!registered.sections.some((item) => item.options.id === 'deepseek-search')) {
  throw new Error('没有注册 settings.section')
}
if (!registered.locales.some((item) => item.namespace === 'deepseek-search')) {
  throw new Error('没有注册 locale')
}
console.log('CLIENT TEST PASSED')
