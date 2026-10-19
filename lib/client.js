window.__ModuleLoader__.load({
  id: 'dsh-deepseek-search',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const h = React.createElement

    const NS = 'deepseek-search'
    let translate = (key) => zh[key] ?? en[key] ?? key

    const zh = {
      title: 'DeepSeek 搜索',
      description: '多引擎网页搜索、正文抓取与深度资料收集。保存后立即生效，无需重启。',
      freeEngines: '免费搜索引擎',
      apiEngines: 'API 搜索引擎（可选，质量更稳）',
      behavior: '抓取与结果设置',
      test: '试搜',
      testPlaceholder: '输入一个关键词，测试当前引擎链',
      testing: '搜索中…',
      save: '保存设置',
      saving: '保存中…',
      saved: '已保存，下一次搜索立即使用新配置。',
      loadFailed: '读取配置失败',
      saveFailed: '保存失败',
      testFailed: '试搜失败',
      enabled: '启用',
      disabled: '未启用',
      available: '可用',
      unavailable: '不可用',
      needsKey: '需要 Key',
      free: '免费',
      cn: '国内直连',
      global: '国际',
      configured: '已配置',
      notConfigured: '未配置',
      keyPlaceholder: '填写 API Key（留空保持不变）',
      keyPlaceholderSet: '已配置，留空保持不变',
      baseURL: '实例地址',
      resultsPerEngine: '每个引擎结果数',
      engineTimeout: '单引擎超时（毫秒）',
      totalTimeout: '整次搜索超时（毫秒）',
      maxChars: '每页正文上限（字符）',
      researchPages: '深度收集默认页数',
      cacheTtl: '结果缓存时间（毫秒）',
      configPath: '配置文件',
      warnings: '配置提示',
      noResults: '没有结果',
      results: '结果',
      engineColumn: '引擎',
      testHint: '试搜只读取已保存的配置；修改后请先保存。',
      keyStored: 'Key 只保存在本机配置文件，不会回显明文。',
    }

    const en = {
      title: 'DeepSeek Search',
      description: 'Multi-engine web search, page extraction, and deep research. Changes apply immediately after saving.',
      freeEngines: 'Free search engines',
      apiEngines: 'API search engines (optional, more reliable)',
      behavior: 'Fetch and result settings',
      test: 'Test search',
      testPlaceholder: 'Enter a keyword to test the current engine chain',
      testing: 'Searching…',
      save: 'Save settings',
      saving: 'Saving…',
      saved: 'Saved. The next search uses the new configuration.',
      loadFailed: 'Failed to load configuration',
      saveFailed: 'Failed to save',
      testFailed: 'Test search failed',
      enabled: 'Enabled',
      disabled: 'Disabled',
      available: 'Available',
      unavailable: 'Unavailable',
      needsKey: 'Key required',
      free: 'Free',
      cn: 'Direct in China',
      global: 'Global',
      configured: 'Configured',
      notConfigured: 'Not configured',
      keyPlaceholder: 'Enter API key (leave blank to keep current)',
      keyPlaceholderSet: 'Configured; leave blank to keep current',
      baseURL: 'Instance URL',
      resultsPerEngine: 'Results per engine',
      engineTimeout: 'Per-engine timeout (ms)',
      totalTimeout: 'Total search timeout (ms)',
      maxChars: 'Max characters per page',
      researchPages: 'Default pages for deep research',
      cacheTtl: 'Result cache TTL (ms)',
      configPath: 'Configuration file',
      warnings: 'Configuration notes',
      noResults: 'No results',
      results: 'Results',
      engineColumn: 'Engines',
      testHint: 'The test uses saved configuration; save changes first.',
      keyStored: 'Keys are stored only in the local config file and are never echoed in plain text.',
    }

    const CSS = `
      .dss-root{display:flex;flex-direction:column;gap:16px;padding:4px 0 32px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
      .dss-head h2{font-size:18px;line-height:1.3;margin:0 0 4px;color:var(--dsw-alias-label-primary)}
      .dss-head p{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}
      .dss-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:16px}
      .dss-card h3{font-size:14px;line-height:1.4;margin:0 0 10px;color:var(--dsw-alias-label-primary)}
      .dss-engine{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}
      .dss-engine:first-of-type{border-top:none;padding-top:2px}
      .dss-engine:last-child{padding-bottom:0}
      .dss-engine-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .dss-engine-name{font-weight:600;color:var(--dsw-alias-label-primary)}
      .dss-engine-desc{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}
      .dss-badge{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;padding:0 7px;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
      .dss-badge.ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
      .dss-badge.warn{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary)}
      .dss-badge.err{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
      .dss-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .dss-switch{display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none}
      .dss-switch input{accent-color:var(--dsw-alias-brand-primary);width:15px;height:15px;margin:0;cursor:pointer}
      .dss-input{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l3);border-radius:8px;color:var(--dsw-alias-label-primary);padding:6px 10px;font:inherit;font-size:12px;min-width:0;outline:none}
      .dss-input:focus{border-color:var(--dsw-alias-brand-primary)}
      .dss-input.grow{flex:1 1 220px}
      .dss-input.num{width:110px}
      .dss-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px 16px}
      .dss-field{display:flex;flex-direction:column;gap:4px}
      .dss-field label{color:var(--dsw-alias-label-secondary);font-size:12px}
      .dss-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .dss-btn{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font:inherit;font-size:12px;cursor:pointer}
      .dss-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
      .dss-btn.primary{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
      .dss-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
      .dss-btn:disabled{opacity:.55;cursor:default}
      .dss-status{font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .dss-status.ok{color:var(--dsw-alias-state-success-primary)}
      .dss-status.err{color:var(--dsw-alias-state-error-primary)}
      .dss-muted{color:var(--dsw-alias-label-tertiary);font-size:12px}
      .dss-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
      .dss-results{display:flex;flex-direction:column;gap:10px;margin-top:10px}
      .dss-result{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2)}
      .dss-result-title{font-weight:600;color:var(--dsw-alias-label-primary);text-decoration:none;word-break:break-word}
      .dss-result-title:hover{text-decoration:underline}
      .dss-result-url{color:var(--dsw-alias-link);font-size:11px;word-break:break-all;margin-top:2px}
      .dss-result-snippet{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:4px;white-space:pre-wrap}
    `

    function injectStyles() {
      if (typeof document === 'undefined') return () => {}
      const existing = document.querySelector('style[data-plugin="dsh-deepseek-search"]')
      if (existing) return () => {}
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-deepseek-search'
      style.textContent = CSS
      document.head.appendChild(style)
      return () => style.remove()
    }

    async function api(path, options) {
      const response = await fetch(path, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) },
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${response.status}`)
      }
      return data
    }

    function badge(text, tone) {
      return h('span', { className: `dss-badge${tone ? ` ${tone}` : ''}` }, text)
    }

    function Field(props) {
      return h(
        'div',
        { className: 'dss-field' },
        h('label', null, props.label),
        h('input', {
          className: 'dss-input num',
          type: 'number',
          min: props.min,
          max: props.max,
          step: props.step ?? 1,
          value: props.value,
          onChange: (event) => props.onChange(Number(event.target.value)),
        }),
      )
    }

    function SettingsPage() {
      const t = translate
      const [loading, setLoading] = React.useState(true)
      const [loadError, setLoadError] = React.useState('')
      const [config, setConfig] = React.useState(null)
      const [meta, setMeta] = React.useState(null)
      const [keys, setKeys] = React.useState({})
      const [saving, setSaving] = React.useState(false)
      const [status, setStatus] = React.useState({ tone: '', text: '' })
      const [testQuery, setTestQuery] = React.useState('')
      const [testing, setTesting] = React.useState(false)
      const [testState, setTestState] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        api('/deepseek-search/config')
          .then((data) => {
            if (!alive) return
            setConfig(data.config)
            setMeta(data)
            setLoading(false)
          })
          .catch((error) => {
            if (!alive) return
            setLoadError(String(error.message ?? error))
            setLoading(false)
          })
        return () => {
          alive = false
        }
      }, [])

      if (loading) return h('div', { className: 'dss-root' }, h('p', { className: 'dss-muted' }, '加载中…'))
      if (loadError) {
        return h(
          'div',
          { className: 'dss-root' },
          h('h2', null, t('title')),
          h('p', { className: 'dss-status err' }, `${t('loadFailed')}：${loadError}`),
        )
      }

      const engines = meta?.engines ?? []
      const freeEngines = engines.filter((engine) => engine.kind !== 'api')
      const apiEngines = engines.filter((engine) => engine.kind === 'api')

      const updateEngine = (id, patch) => {
        setConfig((previous) => ({
          ...previous,
          engines: {
            ...previous.engines,
            [id]: { ...previous.engines[id], ...patch },
          },
        }))
      }

      const updateSection = (section, key, value) => {
        setConfig((previous) => ({
          ...previous,
          [section]: { ...previous[section], [key]: value },
        }))
      }

      const save = async () => {
        setSaving(true)
        setStatus({ tone: '', text: t('saving') })
        try {
          const data = await api('/deepseek-search/config', {
            method: 'POST',
            body: JSON.stringify({ config, keys }),
          })
          setConfig(data.config)
          setMeta(data)
          setKeys({})
          setStatus({ tone: 'ok', text: t('saved') })
        } catch (error) {
          setStatus({ tone: 'err', text: `${t('saveFailed')}：${String(error.message ?? error)}` })
        } finally {
          setSaving(false)
        }
      }

      const runTest = async () => {
        const query = testQuery.trim()
        if (!query) return
        setTesting(true)
        setTestState(null)
        try {
          const data = await api('/deepseek-search/test', {
            method: 'POST',
            body: JSON.stringify({ query }),
          })
          setTestState(data)
        } catch (error) {
          setTestState({ ok: false, error: String(error.message ?? error) })
        } finally {
          setTesting(false)
        }
      }

      const renderEngine = (engine) => {
        const draft = config.engines[engine.id] ?? {}
        return h(
          'div',
          { className: 'dss-engine', key: engine.id },
          h(
            'div',
            { className: 'dss-engine-head' },
            h(
              'label',
              { className: 'dss-switch' },
              h('input', {
                type: 'checkbox',
                checked: Boolean(draft.enabled),
                onChange: (event) => updateEngine(engine.id, { enabled: event.target.checked }),
              }),
              h('span', { className: 'dss-engine-name' }, engine.label),
            ),
            engine.kind === 'api' ? badge(t('needsKey'), engine.hasKey ? 'ok' : 'warn') : badge(t('free')),
            engine.region === 'cn' ? badge(t('cn')) : badge(t('global')),
            engine.available
              ? badge(t('available'), 'ok')
              : badge(engine.enabled ? t('unavailable') : t('disabled'), engine.enabled ? 'warn' : undefined),
          ),
          h('p', { className: 'dss-engine-desc' }, engine.description),
          engine.needsKey
            ? h('input', {
                className: 'dss-input grow',
                type: 'password',
                autoComplete: 'off',
                placeholder: engine.hasKey ? t('keyPlaceholderSet') : t('keyPlaceholder'),
                value: keys[engine.id] ?? '',
                onChange: (event) => setKeys((previous) => ({ ...previous, [engine.id]: event.target.value })),
              })
            : null,
          engine.id === 'searxng'
            ? h('input', {
                className: 'dss-input grow',
                type: 'url',
                placeholder: 'https://searx.example.com',
                value: draft.baseURL ?? '',
                onChange: (event) => updateEngine(engine.id, { baseURL: event.target.value }),
              })
            : null,
          engine.id === 'bing'
            ? h('input', {
                className: 'dss-input grow',
                type: 'url',
                placeholder: 'https://cn.bing.com',
                value: draft.baseURL ?? '',
                onChange: (event) => updateEngine(engine.id, { baseURL: event.target.value }),
              })
            : null,
        )
      }

      return h(
        'div',
        { className: 'dss-root' },
        h(
          'div',
          { className: 'dss-head' },
          h('h2', null, t('title')),
          h('p', null, t('description')),
        ),
        h('div', { className: 'dss-card' }, h('h3', null, t('freeEngines')), freeEngines.map(renderEngine)),
        h('div', { className: 'dss-card' }, h('h3', null, t('apiEngines')), apiEngines.map(renderEngine)),
        h(
          'div',
          { className: 'dss-card' },
          h('h3', null, t('behavior')),
          h(
            'div',
            { className: 'dss-grid' },
            h(Field, {
              label: t('resultsPerEngine'),
              value: config.search.resultsPerEngine,
              min: 1,
              max: 20,
              onChange: (value) => updateSection('search', 'resultsPerEngine', value),
            }),
            h(Field, {
              label: t('engineTimeout'),
              value: config.search.engineTimeoutMs,
              min: 3000,
              max: 30000,
              step: 1000,
              onChange: (value) => updateSection('search', 'engineTimeoutMs', value),
            }),
            h(Field, {
              label: t('totalTimeout'),
              value: config.search.totalTimeoutMs,
              min: 5000,
              max: 60000,
              step: 1000,
              onChange: (value) => updateSection('search', 'totalTimeoutMs', value),
            }),
            h(Field, {
              label: t('maxChars'),
              value: config.fetch.maxCharsPerPage,
              min: 1000,
              max: 50000,
              step: 1000,
              onChange: (value) => updateSection('fetch', 'maxCharsPerPage', value),
            }),
            h(Field, {
              label: t('researchPages'),
              value: config.fetch.researchMaxPages,
              min: 1,
              max: 10,
              onChange: (value) => updateSection('fetch', 'researchMaxPages', value),
            }),
            h(Field, {
              label: t('cacheTtl'),
              value: config.search.cacheTtlMs,
              min: 0,
              max: 3600000,
              step: 30000,
              onChange: (value) => updateSection('search', 'cacheTtlMs', value),
            }),
          ),
          h('p', { className: 'dss-muted' }, t('keyStored')),
        ),
        h(
          'div',
          { className: 'dss-actions' },
          h(
            'button',
            { className: 'dss-btn primary', type: 'button', disabled: saving, onClick: save },
            saving ? t('saving') : t('save'),
          ),
          status.text ? h('span', { className: `dss-status ${status.tone}` }, status.text) : null,
        ),
        meta?.warnings?.length
          ? h(
              'div',
              { className: 'dss-card' },
              h('h3', null, t('warnings')),
              ...meta.warnings.map((warning, index) =>
                h('p', { className: 'dss-status err', key: index }, warning),
              ),
            )
          : null,
        h(
          'div',
          { className: 'dss-card' },
          h('h3', null, t('test')),
          h(
            'div',
            { className: 'dss-row' },
            h('input', {
              className: 'dss-input grow',
              type: 'search',
              placeholder: t('testPlaceholder'),
              value: testQuery,
              onChange: (event) => setTestQuery(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') runTest()
              },
            }),
            h(
              'button',
              { className: 'dss-btn', type: 'button', disabled: testing, onClick: runTest },
              testing ? t('testing') : t('test'),
            ),
          ),
          h('p', { className: 'dss-muted' }, t('testHint')),
          testState?.ok === false
            ? h('p', { className: 'dss-status err' }, `${t('testFailed')}：${testState.error}`)
            : null,
          testState?.warnings?.length
            ? h(
                'div',
                null,
                h('p', { className: 'dss-status err' }, t('warnings')),
                ...testState.warnings.map((warning, index) =>
                  h(
                    'p',
                    { className: 'dss-muted', key: `warning-${index}` },
                    `${warning.engine ?? 'engine'}：${warning.message ?? warning}`,
                  ),
                ),
              )
            : null,
          testState?.ok
            ? h(
                'div',
                { className: 'dss-results' },
                h(
                  'p',
                  { className: 'dss-muted' },
                  `${t('results')}：${testState.results?.length ?? 0}，${testState.elapsedMs ?? 0}ms`,
                ),
                ...(testState.results ?? []).map((item, index) =>
                  h(
                    'div',
                    { className: 'dss-result', key: `${item.url}-${index}` },
                    h(
                      'a',
                      { className: 'dss-result-title', href: item.url, target: '_blank', rel: 'noreferrer' },
                      item.title || item.url,
                    ),
                    h('div', { className: 'dss-result-url' }, item.url),
                    item.snippet ? h('div', { className: 'dss-result-snippet' }, item.snippet) : null,
                    h(
                      'div',
                      { className: 'dss-row', style: { marginTop: '5px' } },
                      ...(item.engines ?? []).map((id) => badge(id)),
                    ),
                  ),
                ),
              )
            : null,
        ),
        h(
          'p',
          { className: 'dss-muted' },
          `${t('configPath')}：`,
          h('span', { className: 'dss-code' }, meta?.configPath ?? ''),
        ),
      )
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      translate = t
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'deepseek-search: locale dictionaries')
      ctx.effect(() => injectStyles(), 'deepseek-search: styles')
      ctx.effect(
        () =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: 'deepseek-search',
                order: 60,
                label: () => t('title'),
                locale: NS,
              },
              SettingsPage,
            ),
          ),
        'deepseek-search: settings section',
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    return module.exports
  },
})
