/* ============ extension/background.js — 唯一中枢 ============ */
/* 职责：配置读写与 Firefox Sync 同步、翻译缓存 LRU 单例、引擎层（微软 token/百度 QPS/LLM 接力全局化）、
 * fetch 出网、badge 状态机（按 tabId）、全局快捷键、消息路由。翻译队列留在 content（防事件页回收）。 */
/* lib/core.js 与 lib/sync-chunks.js 经 manifest background.scripts 按序载入；
 * node 环境（单测/烟测）下手动 require 同名纯函数模块。 */
if (typeof importScripts === 'function' && typeof parseConfig !== 'function') {
  importScripts('lib/sync-chunks.js', 'lib/core.js');
}

/* ================= 配置中枢 ================= */
const ConfigHub = {
  raw: '',
  cfg: null,
  init() {
    this.cfg = parseConfig('');
    return browser.storage.local.get('tl_config_v1').then(o => {
      this.raw = o.tl_config_v1 || '';
      this.cfg = parseConfig(this.raw);
    });
  },
  save(cfg) {
    if (cfg) this.cfg = cfg;
    this.raw = serializeConfig(this.cfg);
    return browser.storage.local.set({ tl_config_v1: this.raw });
  },
  onChange(raw) {
    this.raw = raw || '';
    this.cfg = parseConfig(this.raw);
  }
};

/* ================= 翻译缓存（LRU 单例，跨标签共享） ================= */
const Cache = {
  map: new Map(),
  _timer: 0,
  init() {
    return browser.storage.local.get('tl_cache_v1').then(o => {
      try {
        const arr = JSON.parse(o.tl_cache_v1 || '[]');
        for (const [k, v] of arr) this.map.set(k, v);
      } catch (e) { /* 忽略损坏数据 */ }
    });
  },
  get(key) {
    const v = this.map.get(key);
    if (v !== undefined) { this.map.delete(key); this.map.set(key, v); }
    return v;
  },
  set(key, val) {
    this.map.set(key, val);
    const max = (ConfigHub.cfg && ConfigHub.cfg.cacheMax) || 3000;
    while (this.map.size > max) this.map.delete(this.map.keys().next().value);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.save(), 1500);
  },
  save() {
    try {
      return browser.storage.local.set({ tl_cache_v1: JSON.stringify([...this.map.entries()]) });
    } catch (e) { return Promise.resolve(); }
  },
  clear() {
    this.map.clear();
    return browser.storage.local.remove('tl_cache_v1');
  }
};

/* ================= fetch 出网 ================= */
function http({ method = 'GET', url, headers = {}, data = null, timeout = 30000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  return fetch(url, { method, headers, body: data, signal: ctrl.signal })
    .then(async (r) => {
      clearTimeout(timer);
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
      return { status: r.status, text, json };
    })
    .catch((e) => {
      clearTimeout(timer);
      throw new Error(e && e.name === 'AbortError' ? '请求超时' : '网络错误，请检查接口地址或网络');
    });
}

/* ================= 引擎层（全局状态） ================= */
let lastApiAt = 0;
async function apiGate() {
  const gap = +ConfigHub.cfg.callInterval || 0;
  const now = Date.now();
  const wait = gap > 0 ? Math.max(0, lastApiAt + gap - now) : 0;
  lastApiAt = now + wait;
  if (wait > 0) await sleep(wait);
}

function parseMs(r) {
  if (r.status !== 200 || !Array.isArray(r.json)) throw new Error('微软翻译失败(' + r.status + ')');
  return r.json.map(item => (item.translations && item.translations[0] && item.translations[0].text) || '');
}
/* 微软免费翻译（免鉴权）：Edge translatetext 端点。
 * 旧 token 链路（edge.microsoft.com/translate/auth + api-edge…）已于 2026-07-30 退役（固定 404），
 * 现按 Edge 前端调用方式直连 translatetext：body 为字符串数组，响应结构与旧 API 一致。
 * 限制：单次请求总量 ≤5 万字符（content 批次默认 ≤2500 字符，远低于上限）。 */
async function msTranslateBatch(texts, from, to, timeout) {
  await apiGate();
  const params = new URLSearchParams({ 'api-version': '3.0', to });
  if (from && from !== 'auto') params.set('from', from === 'zh-Hans' ? 'zh-Hans' : from);
  const url = 'https://edge.microsoft.com/translate/translatetext?' + params.toString();
  const t = timeout || ConfigHub.cfg.replyTimeout;
  const r = await http({
    method: 'POST', url,
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify(texts), timeout: t
  });
  return parseMs(r);
}

let baiduLastCall = 0;
async function baiduTranslateOne(text, from, to, timeout) {
  await apiGate();
  const cfg = ConfigHub.cfg.baidu;
  const salt = String(Math.floor(Math.random() * 1e9));
  const sign = md5(cfg.appid + text + salt + cfg.secret);
  const params = new URLSearchParams({
    q: text, from: BAIDU_LANG[from] || 'auto', to: BAIDU_LANG[to] || 'zh',
    appid: cfg.appid, salt, sign
  });
  const wait = 1050 - (Date.now() - baiduLastCall); // 免费版 QPS=1（全局）
  if (wait > 0) await sleep(wait);
  baiduLastCall = Date.now();
  const r = await http({ url: cfg.endpoint + '?' + params.toString(), timeout: timeout || ConfigHub.cfg.replyTimeout });
  if (r.status !== 200 || !r.json) throw new Error('百度翻译失败(' + r.status + ')');
  if (r.json.error_code) {
    const code = String(r.json.error_code);
    if (code === '54003' || code === '-1') {
      await sleep(1500);
      throw new Error('百度翻译限频(' + code + ')');
    }
    throw new Error('百度翻译错误 ' + code + '：' + (r.json.error_msg || ''));
  }
  const res = r.json.trans_result;
  if (!Array.isArray(res) || !res.length) throw new Error('百度翻译返回为空');
  return res.map(x => x.dst).join('\n');
}

async function llmTranslateBatch(model, texts, from, to, timeout, href) {
  await apiGate();
  const headers = { 'Content-Type': 'application/json' };
  if (model.key) headers['Authorization'] = 'Bearer ' + model.key;
  const body = {
    model: model.model,
    temperature: 0.2,
    messages: [
      /* href 让站点专属提示词模板优先于全局设置（仅影响大模型引擎） */
      { role: 'system', content: llmSystemPrompt(from, to, ConfigHub.cfg, href) },
      { role: 'user', content: 'INPUT: ' + JSON.stringify(texts) }
    ]
  };
  if (model.maxTok && model.maxTok > 0) body.max_tokens = Math.round(model.maxTok * 1024);
  const r = await http({ method: 'POST', url: model.endpoint, headers, data: JSON.stringify(body), timeout: timeout || ConfigHub.cfg.replyTimeout });
  if (r.status !== 200 || !r.json) {
    let msg = 'HTTP ' + r.status;
    if (r.json && r.json.error && r.json.error.message) msg += '：' + r.json.error.message;
    throw new Error('模型「' + model.name + '」请求失败 ' + msg);
  }
  const choice = r.json.choices && r.json.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (choice && choice.finish_reason === 'length') {
    throw new Error('模型「' + model.name + '」输出被截断（请调大 max_tokens 或调小「最大字符数」）');
  }
  const out = parseLLMReply(content);
  if (out.length !== texts.length) throw new Error('模型「' + model.name + '」返回条数不符(' + out.length + '/' + texts.length + ')');
  return out;
}

/* 模型接力（粘滞 + 连败降级 + 恢复回切）——只含「启用且已配置」 */
const Relay = {
  sticky: 0,
  concurrencyOf() {
    const list = relayModels(ConfigHub.cfg.models, ConfigHub.cfg.quickModel);
    const m = list[this.sticky] || list[0];
    return (m && m.conc) || ConfigHub.cfg.concurrency || 2;
  },
  async run(texts, from, to, timeout, href) {
    const list = relayModels(ConfigHub.cfg.models, ConfigHub.cfg.quickModel);
    if (!list.length) throw new Error('未配置可用大模型，请在「模型」页配置并启用');
    const order = list.slice(this.sticky).concat(list.slice(0, this.sticky));
    const skipAll = order.every(m => (m.fails || 0) >= 2);
    if (skipAll) order.forEach(m => { m.fails = 0; });
    let lastErr = null, tried = 0;
    for (const m of order) {
      if ((m.fails || 0) >= 2 && tried < order.length - 1) continue;
      tried++;
      try {
        const out = await llmTranslateBatch(m, texts, from, to, timeout, href);
        m.fails = 0;
        this.sticky = list.indexOf(m) >= 0 ? list.indexOf(m) : 0;
        ConfigHub.save();
        return out;
      } catch (e) {
        m.fails = (m.fails || 0) + 1;
        lastErr = e;
        ConfigHub.save();
      }
    }
    throw lastErr || new Error('所有模型均不可用');
  }
};

const Engines = {
  microsoft: {
    name: '微软翻译', textLimit: 5000, maxItemsPerCall: 50,
    configured() { return true; },
    async translate(texts, from, to, timeout) {
      const jobs = [];
      for (let i = 0; i < texts.length; i += 50) jobs.push(texts.slice(i, i + 50));
      const rs = await runPool(jobs, 3, j => msTranslateBatch(j, from, to, timeout));
      const out = [];
      rs.forEach(r => { if (r && r.error) throw r.error; out.push(...r); });
      return out;
    }
  },
  baidu: {
    name: '百度翻译', textLimit: 6000, maxItemsPerCall: 1,
    configured() { return !!(ConfigHub.cfg.baidu.appid && ConfigHub.cfg.baidu.secret); },
    async translate(texts, from, to, timeout) {
      const rs = await runPool(texts, 1, t => baiduTranslateOne(t, from, to, timeout));
      return rs.map(r => { if (r && r.error) throw r.error; return r; });
    }
  },
  llm: {
    name: '大模型', textLimit: 0, maxItemsPerCall: 60,
    configured() { return relayModels(ConfigHub.cfg.models, ConfigHub.cfg.quickModel).length > 0; },
    async translate(texts, from, to, timeout, href) {
      return Relay.run(texts, from, to, timeout, href);
    }
  }
};
function currentEngine() { return Engines[ConfigHub.cfg.engine] || Engines.microsoft; }

/* 测试连接：发真实样本 */
async function testEngine(engineId) {
  const eng = Engines[engineId] || currentEngine();
  if (!eng.configured()) throw new Error('尚未配置');
  const out = await eng.translate(['Hello, world!'], 'en', 'zh-Hans', 30000);
  if (!out || !out[0]) throw new Error('返回为空');
  return out[0];
}
async function probeModels(endpoint, key) {
  const base = String(endpoint || '').replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '');
  if (!base) throw new Error('请先填写接口地址');
  const headers = key ? { 'Authorization': 'Bearer ' + key } : {};
  if (/:\d+/.test(base) && /11434/.test(base)) {
    const r = await http({ url: base.replace(/\/v1$/i, '') + '/api/tags', headers });
    if (r.status !== 200 || !r.json) throw new Error('探测失败(HTTP ' + r.status + ')');
    return (r.json.models || []).map(m => m.name).filter(Boolean);
  }
  const r = await http({ url: base + '/models', headers });
  if (r.status !== 200 || !r.json) throw new Error('探测失败(HTTP ' + r.status + ')');
  const arr = r.json.data || r.json.models || [];
  return arr.map(m => m.id || m.name).filter(Boolean);
}

/* ================= badge 状态机（每标签页独立） =================
 * v1.2：角标只保留三种简洁小图标 ✓ 已完成 / … 翻译中 / ! 错误。
 * 显示模式（原文 / 双语）不再产生独立角标，进度数字改由悬停标题承载。 */
const BADGE_COLORS = { progress: '#0969da', done: '#2da44e', error: '#E24B4A', idle: '#888780' };
const BADGE_ICONS = { progress: '…', done: '✓', error: '!' };
const TabState = new Map(); // tabId → { state, done, total, msg }

function badgeState(s) {
  /* 兼容旧版 content 上报的 bi / orig：一律归入「已完成」 */
  return (s === 'bi' || s === 'orig') ? 'done' : s;
}

function applyBadge(tabId) {
  const st = TabState.get(tabId) || { state: 'idle' };
  const state = badgeState(st.state);
  let text = '', color = BADGE_COLORS.idle, title = '轻译 TransLite';
  if (ConfigHub.cfg && ConfigHub.cfg.badgeEnabled === false) {
    /* 状态角标已关闭：只保留标题，不显示角标 */
    text = ''; color = BADGE_COLORS.idle; title = '轻译 TransLite';
  } else if (state === 'progress') {
    text = BADGE_ICONS.progress; color = BADGE_COLORS.progress;
    title = '轻译：翻译中' + (st.total ? ' ' + st.done + '/' + st.total : '');
  } else if (state === 'done') {
    text = BADGE_ICONS.done; color = BADGE_COLORS.done;
    title = '轻译：已翻译' + (st.total ? ' ' + st.total + ' 段' : '');
  } else if (state === 'error') {
    text = BADGE_ICONS.error; color = BADGE_COLORS.error;
    title = '轻译：出错' + (st.msg ? '（' + st.msg + '）' : '');
  }
  const set = (typeof browser !== 'undefined' && browser.browserAction) ? browser.browserAction : browser.action;
  try {
    set.setBadgeText({ tabId, text });
    set.setBadgeBackgroundColor({ tabId, color });
    set.setTitle({ tabId, title });
  } catch (e) { /* 标签页已关闭 */ }
}

function setStatus(tabId, st) {
  TabState.set(tabId, Object.assign({ state: 'idle', done: 0, total: 0 }, st));
  applyBadge(tabId);
}

/* ================= Firefox Sync 配置同步 ================= */
const Sync = {
  on: false,
  _pushTimer: 0,
  _selfWriteAt: 0,
  async init() {
    const o = await browser.storage.local.get('tl_fxsync_on');
    this.on = o.tl_fxsync_on === 1 || o.tl_fxsync_on === true;
    if (this.on) await this.pull();
  },
  async pull() {
    try {
      const items = await browser.storage.sync.get(null);
      const remote = tlSyncUnpack(items, 'cfg');
      if (remote && remote !== ConfigHub.raw) {
        this._selfWriteAt = Date.now();
        ConfigHub.onChange(remote);
        await browser.storage.local.set({ tl_config_v1: remote });
      }
    } catch (e) { /* 同步不可用忽略 */ }
  },
  push() {
    if (!this.on) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(async () => {
      try {
        const packed = tlSyncPack('cfg', ConfigHub.raw || '');
        const old = await browser.storage.sync.get(null);
        const clear = {};
        for (const k of Object.keys(old)) if (k.startsWith('tlsc:cfg:')) clear[k] = null;
        await browser.storage.sync.set(Object.assign(clear, packed));
      } catch (e) { /* 配额满等忽略 */ }
    }, 1500);
  },
  async setEnabled(on) {
    this.on = !!on;
    await browser.storage.local.set({ tl_fxsync_on: this.on ? 1 : 0 });
    if (this.on) await this.pull();
    else {
      try {
        const old = await browser.storage.sync.get(null);
        const clear = {};
        for (const k of Object.keys(old)) if (k.startsWith('tlsc:cfg:')) clear[k] = null;
        await browser.storage.sync.set(clear);
      } catch (e) { /* 忽略 */ }
    }
  }
};

/* ================= 手动翻译范围：当前域名（会话级标记） =================
 * 用户在某标签手动触发翻译且 manualScope='domain' 时登记主机名；同域其它已打开页
 * 收到广播立即翻译，之后新打开的同域页初始化时查询并自动翻译。仅内存、浏览器重启即清空。 */
const DomainMarks = new Set();

/* ================= 全局开关总闸：动态注册 / 注销 content script ================= */
/* 静态清单无法做到「关闭后零注入」，故 content script 改由 background 按 globalMode 动态注册。
 * 开启：registerContentScripts（未来页面）+ 已打开页按需注入 / 唤醒驻留实例。
 * 关闭：unregisterContentScripts + 广播 destroy（还原原文、移除样式与监听效果、清空角标）。 */
const CONTENT_ID = 'translite-runtime';
const CONTENT_FILES = ['lib/core.js', 'content.js'];
const ContentGate = {
  async sync() {
    const on = ConfigHub.cfg && ConfigHub.cfg.globalMode === 'on';
    if (typeof browser === 'undefined' || !browser.scripting) return; // node 单测桩
    if (on) await this.enable();
    else await this.disable();
  },
  async enable() {
    const S = browser.scripting;
    try {
      let regs = [];
      try { regs = await S.getRegisteredContentScripts({ ids: [CONTENT_ID] }); }
      catch (e) { regs = (await S.getRegisteredContentScripts()) || []; }
      if (!regs.some(r => r && r.id === CONTENT_ID)) {
        await S.registerContentScripts([{
          id: CONTENT_ID, matches: ['<all_urls>'], js: CONTENT_FILES,
          runAt: 'document_idle', allFrames: false
        }]);
      }
    } catch (e) { /* 已注册或权限受限 */ }
    await this.injectOpenTabs();
  },
  async disable() {
    const S = browser.scripting;
    DomainMarks.clear(); // 总闸关闭：域名级手动标记一并清空
    try { await S.unregisterContentScripts({ ids: [CONTENT_ID] }); } catch (e) { /* 未注册 */ }
    await this.broadcast('destroy');
    for (const tabId of [...TabState.keys()]) {
      TabState.delete(tabId);
      applyBadge(tabId);
    }
  },
  async tabs() {
    try { return (await browser.tabs.query({})) || []; } catch (e) { return []; }
  },
  async injectOpenTabs() {
    const S = browser.scripting;
    for (const t of await this.tabs()) {
      if (t.id == null) continue;
      let alive = false, dead = false;
      try {
        const r = await browser.tabs.sendMessage(t.id, { cmd: 'ping' });
        alive = !!(r && r.ok); dead = !!(r && r.dead);
      } catch (e) { /* 页面无 content script */ }
      if (alive) {
        if (dead) { try { await browser.tabs.sendMessage(t.id, { cmd: 'revive' }); } catch (e) {} }
        continue;
      }
      try {
        await S.executeScript({ target: { tabId: t.id, allFrames: false }, files: CONTENT_FILES });
      } catch (e) { /* about: / 特权页 / 受限域名 */ }
    }
  },
  async broadcast(cmd) {
    for (const t of await this.tabs()) {
      if (t.id == null) continue;
      try { await browser.tabs.sendMessage(t.id, { cmd }); } catch (e) { /* 无脚本 */ }
    }
  }
};

/* 配置变更（本地）：重解析 + 推送同步；自写回声 3s 内忽略 */
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tl_config_v1) {
    const prevMode = ConfigHub.cfg && ConfigHub.cfg.globalMode;
    const prevBadge = ConfigHub.cfg && ConfigHub.cfg.badgeEnabled;
    ConfigHub.onChange(changes.tl_config_v1.newValue || '');
    const now = ConfigHub.cfg;
    if (prevMode !== now.globalMode) ContentGate.sync().catch(() => {});
    if (prevBadge !== now.badgeEnabled) {
      for (const tabId of [...TabState.keys()]) applyBadge(tabId);
    }
    if (Date.now() - Sync._selfWriteAt > 3000) Sync.push();
  }
  if (area === 'local' && changes.tl_fxsync_on) {
    Sync.on = changes.tl_fxsync_on.newValue === 1 || changes.tl_fxsync_on.newValue === true;
    if (Sync.on) Sync.pull();
  }
});

/* ================= 消息路由 ================= */
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (!msg || !msg.type) return;
  switch (msg.type) {
    /* 翻译请求：缓存优先，miss 走引擎（全局 QPS/token/接力） */
    case 'translate': {
      const texts = Array.isArray(msg.texts) ? msg.texts : [];
      if (!ConfigHub.cfg || ConfigHub.cfg.globalMode === 'off') {
        sendResponse({ ok: false, error: '总开关已关闭' });
        return;
      }
      const from = msg.from || 'auto';
      const to = msg.to || ConfigHub.cfg.tgtLang;
      const timeout = +msg.timeout || 0;
      /* 站点专属提示词：content 传当前页 URL，兜底用 sender.tab.url */
      const href = String(msg.href || (sender.tab && sender.tab.url) || '');
      (async () => {
        const eng = currentEngine();
        /* 大模型按「生效提示词」隔离缓存：站点模板 / 全局模板的译文互不串用 */
        const ptag = eng === Engines.llm ? '|p' + hashStr(activePromptText(ConfigHub.cfg, href)) : '';
        const keyOf = t => to + ptag + '|' + hashStr(String(t).replace(/\s+/g, ' ').trim());
        const results = new Array(texts.length).fill(null);
        const missIdx = [];
        for (let i = 0; i < texts.length; i++) {
          const key = keyOf(texts[i]);
          const hit = Cache.get(key);
          if (hit !== undefined) results[i] = hit;
          else missIdx.push(i);
        }
        if (missIdx.length) {
          const misses = missIdx.map(i => texts[i]);
          const out = await eng.translate(misses, from, to, timeout, href);
          for (let j = 0; j < missIdx.length; j++) {
            const i = missIdx[j];
            const val = out[j] == null ? '' : String(out[j]);
            const key = keyOf(texts[i]);
            /* 免译规则 2：译文回同原文 → 缓存免译标记（空串） */
            const final = sameTranslation(texts[i], val) ? '' : val;
            Cache.set(key, final);
            results[i] = final;
          }
        }
        sendResponse({ ok: true, results });
      })().catch(e => sendResponse({ ok: false, error: (e && e.message) || '未知错误' }));
      return true;
    }
    case 'status':
      if (tabId != null) setStatus(tabId, msg);
      return;
    case 'toast':
      if (tabId != null) {
        const set = (typeof browser !== 'undefined' && browser.browserAction) ? browser.browserAction : browser.action;
        set.setTitle({ tabId, title: '轻译：' + msg.msg });
      }
      return;
    case 'getTabStatus': {
      const id = msg.tabId != null ? msg.tabId : tabId;
      sendResponse(TabState.get(id) || { state: 'idle' });
      return;
    }
    case 'testEngine':
      testEngine(msg.engine).then(r => sendResponse({ ok: true, sample: r }))
        .catch(e => sendResponse({ ok: false, error: (e && e.message) || '未知错误' }));
      return true;
    case 'testModel':
      llmTranslateBatch(msg.model, ['Hello, world!'], 'en', 'zh-Hans', 30000)
        .then(r => sendResponse({ ok: true, sample: r[0] }))
        .catch(e => sendResponse({ ok: false, error: (e && e.message) || '未知错误' }));
      return true;
    case 'probe':
      probeModels(msg.endpoint, msg.key).then(list => sendResponse({ ok: true, list }))
        .catch(e => sendResponse({ ok: false, error: (e && e.message) || '未知错误' }));
      return true;
    case 'clearCache':
      Cache.clear().then(() => sendResponse({ ok: true, size: 0 }));
      return true;
    case 'cacheInfo':
      sendResponse({ size: Cache.map.size, max: (ConfigHub.cfg && ConfigHub.cfg.cacheMax) || 3000 });
      return;
    case 'syncSet':
      Sync.setEnabled(!!msg.on).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
      return true;
    case 'syncStatus':
      sendResponse({ on: Sync.on });
      return;
    /* 手动触发翻译（manualScope='domain'）：登记主机名并广播给同域其它标签页 */
    case 'markDomain': {
      const host = String(msg.host || '').trim();
      if (host && ConfigHub.cfg && ConfigHub.cfg.globalMode !== 'off') DomainMarks.add(host);
      (async () => {
        for (const t of await ContentGate.tabs()) {
          if (t.id == null || t.id === tabId) continue;
          try { await browser.tabs.sendMessage(t.id, { cmd: 'domainAuto', host }); } catch (e) { /* 无脚本 */ }
        }
      })();
      sendResponse({ ok: true, marked: DomainMarks.has(host) });
      return;
    }
    case 'queryDomain':
      sendResponse({ marked: DomainMarks.has(String(msg.host || '').trim()) });
      return;
  }
});

/* ================= 全局快捷键（fireGuard 防重） ================= */
let lastFire = 0;
function fireGuard(name, fn) {
  const now = Date.now();
  if (now - lastFire < 600) return;
  lastFire = now;
  fn();
}
browser.commands.onCommand.addListener((command) => {
  if (!ConfigHub.cfg || ConfigHub.cfg.globalMode === 'off') return; // 总闸关闭：快捷键不响应
  fireGuard(command, async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || tab.id == null) return;
    try {
      if (command === 'toggle-translate') await browser.tabs.sendMessage(tab.id, { cmd: 'primaryAction' });
      else if (command === 'toggle-bi') await browser.tabs.sendMessage(tab.id, { cmd: 'toggleBi' });
    } catch (e) { /* 页面无 content script */ }
  });
});

/* 标签页关闭清理 */
browser.tabs.onRemoved.addListener((tabId) => { TabState.delete(tabId); });

/* ================= 启动 ================= */
(async () => {
  await ConfigHub.init();
  await Cache.init();
  await Sync.init();
  await ContentGate.sync().catch(() => {});
})();
