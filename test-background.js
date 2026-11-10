/* test-background.js — background.js 集成测试（node：stub browser.* + fetch） */
const fs = require('fs');
const assert = require('assert');

/* ---- 桩 ---- */
const storageLocal = {
  tl_config_v1: JSON.stringify({ engine: 'microsoft', tgtLang: 'zh-Hans', retryCount: 0, cacheMax: 100 })
};
const msgHandlers = [];
const storageChanged = [];
const badges = [];
let llmPrompts = [];
global.browser = {
  storage: {
    local: {
      get(k) {
        if (typeof k === 'string') return Promise.resolve({ [k]: storageLocal[k] });
        const out = {};
        for (const key of (k || Object.keys(storageLocal))) if (storageLocal[key] !== undefined) out[key] = storageLocal[key];
        return Promise.resolve(out);
      },
      set(o) { Object.assign(storageLocal, o); return Promise.resolve(); },
      remove(k) { delete storageLocal[k]; return Promise.resolve(); }
    },
    sync: { get() { return Promise.resolve({}); }, set() { return Promise.resolve(); } },
    onChanged: { addListener(fn) { storageChanged.push(fn); } }
  },
  runtime: {
    onMessage: { addListener(fn) { msgHandlers.push(fn); } },
    sendMessage() { return Promise.resolve(); }
  },
  browserAction: {
    setBadgeText(o) { badges.push(o); }, setBadgeBackgroundColor() {}, setTitle() {}
  },
  commands: { onCommand: { addListener() {} } },
  tabs: { onRemoved: { addListener() {} }, query() { return Promise.resolve([]); }, sendMessage() { return Promise.resolve(); } }
};

let fetchCalls = [];
global.fetch = (url, opts) => {
  fetchCalls.push(String(url));
  const u = String(url);
  if (u.includes('translatetext')) {
    let texts = [];
    try { texts = JSON.parse(opts.body); } catch (e) { /* 忽略 */ }
    const json = texts.map(t => ({ translations: [{ text: /SAME-MARKER/.test(t) ? t : t + '·译' }] }));
    return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify(json)) });
  }
  if (u.includes('chat/completions')) {
    let body = {};
    try { body = JSON.parse(opts.body); } catch (e) { /* 忽略 */ }
    const msgs = body.messages || [];
    llmPrompts.push((msgs[0] && msgs[0].content) || '');
    let arr = [];
    try { arr = JSON.parse(String((msgs[1] && msgs[1].content) || '').replace(/^INPUT:\s*/, '')); } catch (e) { /* 忽略 */ }
    return Promise.resolve({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(arr.map(t => t + '·译')) }, finish_reason: 'stop' }]
      }))
    });
  }
  return Promise.resolve({ status: 404, text: () => Promise.resolve('') });
};

/* ---- 载入 core + sync-chunks + background（eval 注入全局） ---- */
const coreSrc = fs.readFileSync(__dirname + '/extension/lib/core.js', 'utf8');
const syncSrc = fs.readFileSync(__dirname + '/extension/lib/sync-chunks.js', 'utf8');
const bgSrc = fs.readFileSync(__dirname + '/extension/background.js', 'utf8');
(0, eval)(coreSrc + '\n' + syncSrc + '\n' + bgSrc);

function send(msg, sender) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const handled = msgHandlers[0](msg, sender || {}, done);
    /* 同步分支（返回非 true）：无论是否已回包，都结束等待 */
    if (handled !== true) done(undefined);
  });
}

(async () => {
  await new Promise(r => setTimeout(r, 50)); // 等初始化

  /* 1. 翻译请求：结果对齐 + 译文回填 */
  fetchCalls = [];
  const r1 = await send({ type: 'translate', texts: ['Hello world', 'SAME-MARKER-1'], from: 'en', to: 'zh-Hans' });
  assert.ok(r1 && r1.ok, 'translate ok');
  assert.strictEqual(r1.results[0], 'Hello world·译');
  assert.strictEqual(r1.results[1], '', '译文回同原文 → 免译标记（空串）');

  /* 2. 缓存命中：同文再译不发请求 */
  fetchCalls = [];
  const r2 = await send({ type: 'translate', texts: ['Hello world'], from: 'en', to: 'zh-Hans' });
  assert.strictEqual(r2.results[0], 'Hello world·译');
  assert.strictEqual(fetchCalls.filter(u => u.includes('translatetext')).length, 0, '缓存命中不请求');
  /* 免译标记同样命中缓存 */
  const r3 = await send({ type: 'translate', texts: ['SAME-MARKER-1'], from: 'en', to: 'zh-Hans' });
  assert.strictEqual(r3.results[0], '', '免译标记缓存命中');

  /* 3. badge 状态机（v1.2：只允许 ✓ / … / ! 三种小图标） */
  const lastBadge = () => badges.filter(b => b.tabId === 7).pop();
  await send({ type: 'status', state: 'progress', done: 1, total: 4 }, { tab: { id: 7 } });
  assert.strictEqual(lastBadge().text, '…', '翻译中应为简洁省略号，不再显示 1/4 数字');
  await send({ type: 'status', state: 'done', done: 4, total: 4 }, { tab: { id: 7 } });
  assert.strictEqual(lastBadge().text, '✓', '已完成');
  await send({ type: 'status', state: 'bi', done: 4, total: 4 }, { tab: { id: 7 } });
  assert.strictEqual(lastBadge().text, '✓', '双语模式不应产生独立角标');
  await send({ type: 'status', state: 'orig', done: 4, total: 4 }, { tab: { id: 7 } });
  assert.strictEqual(lastBadge().text, '✓', '原文模式不应产生独立角标');
  await send({ type: 'status', state: 'idle' }, { tab: { id: 7 } });
  assert.strictEqual(lastBadge().text, '', '空闲不显示角标');
  await send({ type: 'status', state: 'error', msg: 'x' }, { tab: { id: 7 } });
  assert.strictEqual(lastBadge().text, '!', '错误');
  const distinct = [...new Set(badges.filter(b => b.tabId === 7).map(b => b.text))].filter(Boolean);
  assert.deepStrictEqual(distinct.slice().sort(), ['!', '…', '✓'].sort(), '角标形态应恰好三种');

  /* 4. cacheInfo / clearCache */
  const info = await send({ type: 'cacheInfo' });
  assert.ok(info.size >= 2, 'cache size ' + info.size);
  await send({ type: 'clearCache' });
  const info2 = await send({ type: 'cacheInfo' });
  assert.strictEqual(info2.size, 0);

  /* 5. getTabStatus */
  const st = await send({ type: 'getTabStatus', tabId: 7 });
  assert.strictEqual(st.state, 'error');

  /* 6. v1.3 站点专属提示词：按 href 选模板，缓存按生效模板隔离 */
  const llmCfg = {
    engine: 'llm', globalMode: 'on', tgtLang: 'zh-Hans', cacheMax: 100, retryCount: 0,
    quickModel: 'm-site', promptPreset: 'general',
    prompts: [
      { id: 'u-site', name: '专利站点', text: 'SITE-PROMPT-A', site: '*.zhihuiya.com', enabled: true }
    ],
    models: [{
      id: 'm-site', name: '测试模型', vendor: '测试',
      endpoint: 'https://llm.test/v1/chat/completions', model: 'test-model',
      key: 'sk-x', conc: 0, maxTok: 0, enabled: true, fails: 0
    }]
  };
  storageLocal.tl_config_v1 = JSON.stringify(llmCfg);
  for (const fn of storageChanged) fn({ tl_config_v1: { newValue: storageLocal.tl_config_v1 } }, 'local');
  llmPrompts = [];
  const r6 = await send({ type: 'translate', texts: ['Site paragraph'], from: 'auto', to: 'zh-Hans',
    href: 'https://analytics.zhihuiya.com/patent' });
  assert.ok(r6 && r6.ok, 'llm translate ok');
  assert.ok(llmPrompts[0] && llmPrompts[0].includes('SITE-PROMPT-A'), '站点模板应进入 system prompt');
  const r7 = await send({ type: 'translate', texts: ['Other paragraph'], from: 'auto', to: 'zh-Hans',
    href: 'https://example.com/' });
  assert.ok(r7 && r7.ok, 'llm translate on other site ok');
  assert.ok(llmPrompts[1] && llmPrompts[1].includes('你是专业翻译引擎'), '其它站点回退全局模板');
  assert.ok(!llmPrompts[1].includes('SITE-PROMPT-A'), '其它站点不应带入站点模板');
  assert.ok(llmPrompts[0].includes('DIFFERENT'), '多语言混批措辞应生效');
  /* 同一段文字在不同提示词模板下不共用缓存 */
  fetchCalls = [];
  const r8 = await send({ type: 'translate', texts: ['Other paragraph'], from: 'auto', to: 'zh-Hans',
    href: 'https://analytics.zhihuiya.com/patent' });
  assert.ok(r8 && r8.ok);
  assert.strictEqual(fetchCalls.length, 1, '不同模板不应命中同一条缓存');

  console.log('ALL PASS: background 集成用例通过（翻译/缓存/免译标记/badge/缓存管理/站点提示词）');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
