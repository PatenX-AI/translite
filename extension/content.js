/* ============ extension/content.js — 轻执行器 ============ */
/* 职责：分段抽取 / 译文渲染 / 队列调度 / 指译。页面内零 UI；请求经 background 出网；
 * 配置经 storage.local 镜像 + onChanged 热更新。依赖 lib/core.js（manifest 先行载入）。 */

/* 重复注入守卫：总闸开/关切换时不重复声明全局 const（core.js 亦只注入一次） */
if (window.__TL_INSTALLED__) {
  /* 已有实例：静默跳过 */
} else {
window.__TL_INSTALLED__ = true;

/* ================= 配置镜像（同步读 + 热更新） ================= */
const Cfg = parseConfig('');
function cfgSave() {
  try { return browser.storage.local.set({ tl_config_v1: serializeConfig(Cfg) }); }
  catch (e) { return Promise.resolve(); }
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tl_config_v1) {
    const wasOn = Cfg.globalMode !== 'off';
    const fresh = parseConfig(changes.tl_config_v1.newValue || '');
    Object.keys(Cfg).forEach(k => { delete Cfg[k]; });
    Object.assign(Cfg, fresh);
    const isOn = Cfg.globalMode !== 'off';
    if (!isOn) destroyContent();
    else if (!wasOn) reviveContent();
    if (Scan.observer) Scan.resetObserver();
    /* 延迟一拍：等脚本顶层定义全部就绪，再按新规则刷新 XPath 打标 */
    setTimeout(refreshXPathMarks, 0);
  }
});

/* ================= 译文渲染样式（唯一注入的页面样式，总闸关闭时零注入） ================= */
const TL_RENDER_CSS = `
[data-tl-trans][data-tl-block] { display: block; }
[data-tl-trans][data-tl-inline] { display: inline; }
[data-tl-trans]:empty { display: none !important; }
html:not([data-tl-active]) [data-tl-trans] { display: none; }
[data-tl-active][data-tl-mode="orig"] [data-tl-trans] { display: none !important; }
[data-tl-active][data-tl-mode="target"] [data-tl-orig][data-tl-ready] { display: none !important; }
[data-tl-active][data-tl-mode="target"] mark:has([data-tl-ready]) { display: none !important; }
[data-tl-active][data-tl-mode="bi"] [data-tl-tgt-only][data-tl-orig][data-tl-ready] { display: none !important; }
[data-tl-active][data-tl-mode="bi"] mark:has([data-tl-tgt-only][data-tl-ready]) { display: none !important; }
html[data-tl-active][data-tl-mode] [data-tl-peek="orig"][data-tl-orig][data-tl-ready] { display: revert !important; }
html[data-tl-active][data-tl-mode] mark:has([data-tl-peek="orig"][data-tl-ready]) { display: revert !important; }
html[data-tl-active][data-tl-mode] [data-tl-peek="orig"][data-tl-trans] { display: none !important; }
html[data-tl-active][data-tl-mode] [data-tl-peek="tgt"][data-tl-orig][data-tl-ready] { display: none !important; }
html[data-tl-active][data-tl-mode] mark:has([data-tl-peek="tgt"][data-tl-ready]) { display: none !important; }
html[data-tl-active][data-tl-mode] [data-tl-peek="bi"][data-tl-orig][data-tl-ready] { display: revert !important; }
html[data-tl-active][data-tl-mode] mark:has([data-tl-peek="bi"][data-tl-ready]) { display: revert !important; }
html[data-tl-active][data-tl-mode] [data-tl-peek="tgt"][data-tl-trans][data-tl-block]:not(:empty),
html[data-tl-active][data-tl-mode] [data-tl-peek="bi"][data-tl-trans][data-tl-block]:not(:empty) { display: block !important; }
html[data-tl-active][data-tl-mode] [data-tl-peek="tgt"][data-tl-trans][data-tl-inline]:not(:empty),
html[data-tl-active][data-tl-mode] [data-tl-peek="bi"][data-tl-trans][data-tl-inline]:not(:empty) { display: inline !important; }
html:not([data-tl-active]) [data-tl-peek="tgt"][data-tl-orig][data-tl-ready] { display: none !important; }
html:not([data-tl-active]) mark:has([data-tl-peek="tgt"][data-tl-ready]) { display: none !important; }
html:not([data-tl-active]) [data-tl-peek="tgt"][data-tl-trans][data-tl-block]:not(:empty),
html:not([data-tl-active]) [data-tl-peek="bi"][data-tl-trans][data-tl-block]:not(:empty) { display: block !important; }
html:not([data-tl-active]) [data-tl-peek="tgt"][data-tl-trans][data-tl-inline]:not(:empty),
html:not([data-tl-active]) [data-tl-peek="bi"][data-tl-trans][data-tl-inline]:not(:empty) { display: inline !important; }
[data-tl-orig][data-tl-busy]::after {
  content: ''; display: inline-block; width: .78em; height: .78em; margin-left: .3em;
  border: 2px solid rgba(120,128,138,.35); border-top-color: rgba(80,88,98,.85);
  border-radius: 50%; vertical-align: -0.08em;
  animation: tl-spin 1.1s linear infinite;
}
@keyframes tl-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  [data-tl-orig][data-tl-busy]::after { animation: none; opacity: .6; }
}`;
function injectRenderCSS() {
  if (document.getElementById('tl-style')) return;
  const st = document.createElement('style');
  st.id = 'tl-style';
  st.textContent = TL_RENDER_CSS;
  (document.head || document.documentElement).appendChild(st);
}
function removeRenderCSS() {
  const st = document.getElementById('tl-style');
  if (st && st.parentNode) st.parentNode.removeChild(st);
}

/* ================= 提示 / 状态上报 ================= */
function toast(msg) {
  try { browser.runtime.sendMessage({ type: 'toast', msg: String(msg) }); } catch (e) { /* 忽略 */ }
}
function reportStatus(state, done, total, msg) {
  try { browser.runtime.sendMessage({ type: 'status', state, done: done || 0, total: total || 0, msg: msg || '' }); } catch (e) { /* 忽略 */ }
}

/* 页面语言检测 */
function detectPageLang() {
  try {
    const txt = (document.body && (document.body.innerText || document.body.textContent)) || '';
    return detectLang(txt.slice(0, 4000));
  } catch (e) { return 'other'; }
}

/* ================= 分段抽取 / 渲染（04 移植） ================= */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP',
  'TEXTAREA', 'OPTION', 'TITLE', 'SVG', 'MATH', 'IFRAME', 'TEMPLATE', 'OBJECT', 'EMBED', 'HEAD']);
const BLOCK_TAGS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'CAPTION',
  'DD', 'DETAILS', 'DIALOG', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER',
  'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HTML', 'LEGEND', 'LI', 'MAIN', 'MENU',
  'NAV', 'OL', 'P', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL']);
const UNIT_TAGS = new Set(['BUTTON']);
const INLINE_TAGS = new Set(['A', 'SPAN', 'EM', 'STRONG', 'B', 'I', 'U', 'S', 'SMALL', 'ABBR',
  'CITE', 'Q', 'FONT', 'TIME', 'DATA', 'MARK', 'SUB', 'SUP', 'INS', 'DEL', 'STRIKE', 'LABEL',
  'CODE', 'KBD', 'SAMP', 'VAR', 'TT', 'BIG', 'WBR', 'NOBR']);

function isSkippable(el) {
  if (!el || el.nodeType !== 1) return true;
  if (el.closest('[data-tl-xp="skip"]')) return true;
  const forceInline = !!el.closest('[data-tl-xp="inline"]');
  if (el.closest('script,style,noscript,textarea,option,svg,math,iframe,template,object,embed,[data-tl-skip],[data-tl-root],[data-tl-orig],[data-tl-trans],[contenteditable="true"]')) return true;
  if (!forceInline && el.closest('code,pre,kbd,samp')) return true;
  if (SKIP_TAGS.has(el.tagName)) {
    if (forceInline && (el.tagName === 'CODE' || el.tagName === 'PRE' || el.tagName === 'KBD' || el.tagName === 'SAMP')) return false;
    return true;
  }
  return false;
}
function breaksLine(el) {
  if (!el || el.nodeType !== 1) return false;
  const t = el.tagName;
  if (t === 'BR') return true;
  if (BLOCK_TAGS.has(t)) return true;
  try {
    const d = getComputedStyle(el).display;
    if (d === 'contents' || d === 'none') return false;
    return !String(d).startsWith('inline');
  } catch (e) {
    return INLINE_TAGS.has(t) ? false : true;
  }
}
/* 当前页面生效的「正则类」规则（含 skip / inline / trans）；
 * 配置变化时由 refreshRegexRules() 重建，避免每段重复求值站点。 */
let regexRules = [];
function refreshRegexRules() {
  try { regexRules = activeRegexRules(Cfg, location.href); }
  catch (e) { regexRules = []; }
}
/* 入队前过滤（顺序固定）：空/过短 → 纯数字符号 → 正则全段匹配 → 与目标语言相同。
 * 正则必须排在 detectLang 之前：编号/邮件/网址会被字符启发式误判为某种自然语言。
 * 过滤只发生在入队前，批内 texts[] 与返回 results 的条数始终一致。 */
function translatable(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (t.length < (Cfg.minLength || 0)) return false;
  if (isSkipText(t)) return false;
  if (shouldSkipByRules(t, regexRules)) return false;
  const base = LANG_BASE[Cfg.tgtLang] || 'zh';
  const dl = detectLang(t);
  if (base === 'zh' && dl === 'zh') return false;
  if (base === dl && base !== 'other') return false;
  return true;
}
function collectSegments(root) {
  const out = [];
  let region = [];
  const flush = () => {
    if (!region.length) return;
    const items = region;
    region = [];
    const groups = [];
    let cur = null;
    for (const it of items) {
      const u = it.unit || null;
      if (!cur || cur.unit !== u) { cur = { nodes: [], unit: u }; groups.push(cur); }
      cur.nodes.push(it.node);
    }
    const unitGroups = groups.filter(g => g.unit);
    const hasButton = unitGroups.some(g => g.unit.tagName === 'BUTTON');
    let linkList = false;
    if (!hasButton && unitGroups.length >= 2 && unitGroups.every(g => g.unit.tagName === 'A')) {
      const nonLink = groups.filter(g => !g.unit)
        .map(g => g.nodes.map(n => n.nodeValue).join('')).join('');
      const stripped = nonLink.replace(/[\s|·・/\\,、;；:：\-–—~～()（）[\]【】]/g, '');
      const shortLinks = unitGroups.every(g =>
        g.nodes.map(n => n.nodeValue).join('').trim().length <= 40);
      linkList = stripped.length <= 4 && shortLinks;
    }
    if (hasButton || linkList) {
      for (const g of groups) {
        if (g.nodes.length) out.push({ nodes: g.nodes, kind: 'frag' });
      }
    } else {
      out.push({ nodes: items.map(it => it.node), kind: 'line' });
    }
  };
  const walk = (el, unit) => {
    for (let child = el.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        if (!child.nodeValue) continue;
        region.push({ node: child, unit: unit || null });
      } else if (child.nodeType === 1) {
        if (isSkippable(child)) continue;
        if (child.tagName === 'BR') { flush(); continue; }
        if (breaksLine(child)) { flush(); walk(child, null); flush(); continue; }
        const u = (UNIT_TAGS.has(child.tagName) || child.tagName === 'A') ? child : unit;
        walk(child, u);
      }
    }
  };
  walk(root, null);
  flush();
  return out;
}
function segText(seg) {
  return seg.nodes.map(n => n.nodeValue).join('').replace(/\s+/g, ' ').trim();
}
function applyXPathMarks(root) {
  const rules = activeXPathRules(Cfg, location.href);
  if (!rules.length) return;
  const doc = (root && root.ownerDocument) || document;
  const mark = (r) => {
    let res;
    try {
      res = doc.evaluate(r.xpath, root || doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    } catch (e) { return; }
    for (let i = 0; i < res.snapshotLength; i++) {
      const node = res.snapshotItem(i);
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (!el || el.nodeType !== 1) continue;
      if (r.mode === 'skip') {
        el.setAttribute('data-tl-xp', 'skip');
        el.removeAttribute('data-tl-xp-trans');
      } else if (r.mode === 'trans') {
        if (el.getAttribute('data-tl-xp') !== 'skip') el.setAttribute('data-tl-xp-trans', '');
      } else if (!el.hasAttribute('data-tl-xp')) {
        el.setAttribute('data-tl-xp', 'inline');
      }
    }
  };
  for (const r of rules) if (r.mode === 'inline' || r.mode === 'trans') mark(r);
  for (const r of rules) if (r.mode === 'skip') mark(r);
}
/* 规则集合变化时（含站点级规则增删/改站点）清除旧打标并重新求值，
 * 避免已删除或不匹配当前站点的规则残留；已开启翻译时补扫一次新增可译段落。 */
let lastXpSig = JSON.stringify(Cfg.behaviorRules || []);
function refreshXPathMarks() {
  refreshRegexRules();
  const sig = JSON.stringify(Cfg.behaviorRules || []);
  if (sig === lastXpSig) return;
  lastXpSig = sig;
  if (!gateOpen()) return;
  for (const el of document.querySelectorAll('[data-tl-xp],[data-tl-xp-trans]')) {
    el.removeAttribute('data-tl-xp');
    el.removeAttribute('data-tl-xp-trans');
  }
  applyXPathMarks(document);
  if (State.on) Scan.run(document.documentElement);
}
function cacheKey(text) {
  return Cfg.tgtLang + '|' + hashStr(String(text).replace(/\s+/g, ' ').trim());
}
function blockContainerOf(node) {
  let el = node && node.nodeType === 1 ? node : (node && node.parentElement);
  while (el && el !== document.body && el !== document.documentElement) {
    if (breaksLine(el)) return el;
    el = el.parentElement;
  }
  return el || null;
}
function sameLineSiblings(el) {
  if (!el || !el.parentElement) return false;
  const top = el.offsetTop;
  for (const s of el.parentElement.children) {
    if (s === el || s.nodeType !== 1) continue;
    if (s.hasAttribute && (s.hasAttribute('data-tl-trans') || s.hasAttribute('data-tl-orig'))) continue;
    if (Math.abs(s.offsetTop - top) <= 4) return true;
  }
  return false;
}
function preferInline(seg, blockEl, text) {
  if (seg.kind === 'frag') return true;
  for (const n of seg.nodes) {
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (el && el.closest && el.closest('[data-tl-xp="inline"]')) return true;
  }
  const t = String(text || '');
  const el = blockEl;
  if (!el || el.nodeType !== 1) return t.length <= Cfg.inlineThreshold;
  try {
    const d = getComputedStyle(el).display;
    if (String(d).startsWith('inline')) return true;
    const p = el.parentElement;
    if (p) {
      const ps = getComputedStyle(p);
      if (String(ps.display).indexOf('flex') >= 0 && String(ps.flexDirection).startsWith('row')) return true;
      if (String(ps.display).startsWith('inline')) return true;
    }
    if (sameLineSiblings(el)) return true;
  } catch (e) { /* 布局信息不可得时走长度兜底 */ }
  return t.length <= Cfg.inlineThreshold;
}
function wrapSegment(seg) {
  const live = seg.nodes.filter(n => n.parentNode);
  if (!live.length) return null;
  const text = segText(seg);
  /* v1.4：正则类规则也可设 inline / trans，按整段文本命中后与 XPath 打标等价生效 */
  const rmark = regexMarkFor(text, regexRules);
  const inline = rmark === 'inline' || preferInline(seg, blockContainerOf(live[live.length - 1]), text);
  let tgtOnly = rmark === 'trans';
  for (const n of seg.nodes) {
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (el && el.closest && el.closest('[data-tl-xp-trans]')) { tgtOnly = true; break; }
  }
  const origs = [];
  let last = null;
  for (const n of live) {
    const span = document.createElement('span');
    span.setAttribute('data-tl-orig', '');
    if (tgtOnly) span.setAttribute('data-tl-tgt-only', '');
    span.textContent = n.nodeValue;
    n.parentNode.replaceChild(span, n);
    origs.push(span);
    last = span;
  }
  const trans = document.createElement('span');
  const blockEl = blockContainerOf(last);
  trans.setAttribute('data-tl-trans', '');
  if (tgtOnly) trans.setAttribute('data-tl-tgt-only', '');
  trans.setAttribute(inline ? 'data-tl-inline' : 'data-tl-block', '');
  let insertAfter = last;
  let p = last.parentNode;
  while (p && p.nodeType === 1 && p !== document.body && !breaksLine(p) && !UNIT_TAGS.has(p.tagName)) {
    insertAfter = p;
    p = p.parentNode;
  }
  const anchor = insertAfter.parentNode || last.parentNode;
  anchor.insertBefore(trans, insertAfter.nextSibling);
  const entry = { text, key: cacheKey(text), origs, trans, done: false };
  origs.forEach(o => { o._tlEntry = entry; });
  trans._tlEntry = entry;
  return entry;
}
function setBusy(entry, on) {
  if (!entry || !entry.origs) return;
  if (on) {
    const last = entry.origs[entry.origs.length - 1];
    if (last && last.isConnected) last.setAttribute('data-tl-busy', '');
  } else {
    for (const o of entry.origs) {
      if (o && o.isConnected) o.removeAttribute('data-tl-busy');
    }
  }
}
/* 译文回填：空串 = 免译标记（译文同原文），保留原文不渲染、不重试 */
function fillTrans(entry, translated) {
  const dups = Queue.byKey.get(entry.key) || null;
  if (dups) Queue.byKey.delete(entry.key);
  const list = dups && dups.length ? dups.slice() : [entry];
  if (list.indexOf(entry) < 0) list.push(entry);
  for (const e of list) {
    if (e.done || !e.trans || !e.trans.isConnected) continue;
    setBusy(e, false);
    if (!translated) {
      /* 免译：移除译文容器，原文保持原状 */
      if (e.trans.parentNode) e.trans.parentNode.removeChild(e.trans);
      e.trans = null;
      e.done = true;
      continue;
    }
    e.trans.textContent = translated;
    e.done = true;
    for (const o of e.origs) {
      if (o && o.isConnected) o.setAttribute('data-tl-ready', '');
    }
  }
}
function unwrapEntry(entry) {
  const { origs, trans } = entry;
  setBusy(entry, false);
  if (trans && trans.parentNode) trans.parentNode.removeChild(trans);
  const parents = new Set();
  for (const o of (origs || [])) {
    if (!o || !o.parentNode) continue;
    const parent = o.parentNode;
    parents.add(parent);
    while (o.firstChild) parent.insertBefore(o.firstChild, o);
    parent.removeChild(o);
  }
  parents.forEach(p => { if (p && p.isConnected) p.normalize(); });
  entry.done = true;
  entry._peek = null;
}

/* ================= 显示状态 ================= */
function setMode(m, silent) {
  if (!['orig', 'target', 'bi'].includes(m)) m = 'target';
  Cfg.mode = m;
  document.documentElement.setAttribute('data-tl-mode', m);
  clearPeek();
  cfgSave();
  if (!silent) {
    /* v1.2：角标只反映任务状态（翻译中/已完成/出错），显示模式不单独占角标 */
    if (State.translated) reportStatus('done', Queue.stats.done, Scan.entries.length);
    else reportStatus('idle', 0, 0);
  }
}
function applyBiPref(on, silent) {
  Cfg.biPref = !!on;
  cfgSave();
  clearPeek();
  if (Cfg.mode !== 'orig') setMode(on ? 'bi' : 'target', silent);
}
function toggleBiPref() {
  if (!gateOpen()) return;
  applyBiPref(!Cfg.biPref);
  toast(Cfg.biPref ? '双语显示：开' : '双语显示：关（仅译文）');
}

/* ================= 调度队列（请求经 background） ================= */
const Queue = {
  pending: [],
  byKey: new Map(),
  pumping: false,
  timer: 0,
  stats: { done: 0, fail: 0 },

  add(entry) {
    if (!gateOpen()) return;
    if (!entry || entry.done) return;
    const dup = this.byKey.get(entry.key);
    if (dup) {
      if (dup.indexOf(entry) < 0) dup.push(entry);
      setBusy(entry, true);
      return;
    }
    this.byKey.set(entry.key, [entry]);
    setBusy(entry, true);
    this.pending.push(entry);
    this.kick();
  },

  fail(key) {
    const dups = this.byKey.get(key);
    this.byKey.delete(key);
    for (const e of (dups || [])) setBusy(e, false);
  },

  reset() {
    for (const e of this.pending) {
      setBusy(e, false);
      e._plan = null;
      e._failed = false;
    }
    this.pending.length = 0;
    this.byKey.clear();
  },

  kick() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = 0; this.pump(); }, 60);
  },

  concOf() {
    const eng = Cfg.engine;
    if (eng === 'baidu') return 1;
    if (eng === 'microsoft') return 3;
    const rel = relayModels(Cfg.models, Cfg.quickModel);
    const m = rel[0];
    return (m && m.conc) || Cfg.concurrency || 2;
  },

  async pump() {
    if (this.pumping || !gateOpen()) return;
    this.pumping = true;
    try {
      while (this.pending.length) {
        const maxChars = Math.max(200, +Cfg.maxBatchChars || 1000);
        const cap = maxChars; // 引擎单条上限由 background 再限；大段直发按 Max Tokens 预算判定
        const maxItems = Math.max(1, +Cfg.maxBatchSegs || 50);
        const rel = relayModels(Cfg.models, Cfg.quickModel);
        const maxTokK = rel.length ? (+rel[0].maxTok || 0) : 0;
        const units = [];
        while (this.pending.length) {
          const e = this.pending.shift();
          if (!e.trans || !e.trans.isConnected || e.done) {
            if (!e.done) this.fail(e.key);
            continue;
          }
          /* 大段直发：未超 Max Tokens 预算整段直发（等待延长），超限才按句切分 */
          const plan = planPieces(e.text, cap, maxTokK, +Cfg.replyTimeout || 90000);
          e._plan = { results: plan.parts.map(() => null) };
          e._failed = false;
          e._timeout = plan.timeoutMs;
          for (let i = 0; i < plan.parts.length; i++) {
            units.push({ entry: e, idx: i, text: plan.parts[i] });
          }
        }
        if (!units.length) continue;
        const jobs = packBatches(units, maxChars, maxItems);
        await runPool(jobs, this.concOf(), job => this.process(job));
      }
    } finally {
      this.pumping = false;
    }
  },

  /* 失败整批重试；超次数报错保留原文 */
  async process(job) {
    if (!gateOpen()) return;
    const live = job.filter(u => u && u.entry && u.entry._plan && !u.entry._failed &&
      u.entry.trans && u.entry.trans.isConnected && !u.entry.done);
    if (!live.length) return;
    const retries = Math.max(0, +Cfg.retryCount || 0);
    const flat = live.map(u => u.text);
    const timeout = Math.max(...live.map(u => +u.entry._timeout || 0), +Cfg.replyTimeout || 90000);
    let out = null, err = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(Math.min(500 * attempt, 2500));
      try {
        const resp = await browser.runtime.sendMessage({
          type: 'translate', texts: flat, from: Cfg.srcLang, to: Cfg.tgtLang, timeout,
          href: location.href /* 站点专属提示词模板按当前页 URL 生效 */
        });
        if (!resp || !resp.ok) throw new Error((resp && resp.error) || '翻译请求失败');
        out = resp.results;
        if (!Array.isArray(out) || out.length !== flat.length) {
          throw new Error('返回条数不符(' + (out ? out.length : 0) + '/' + flat.length + ')');
        }
        err = null;
        break;
      } catch (e) { err = e; out = null; }
    }
    const entries = new Set();
    for (const u of live) entries.add(u.entry);
    if (!gateOpen()) return; // 等待期间总闸被关闭：丢弃结果，不渲染
    if (!out) {
      for (const entry of entries) {
        if (entry._failed || entry.done) continue;
        entry._failed = true;
        this.stats.fail++;
        this.fail(entry.key);
      }
      toast('翻译失败（已重试 ' + retries + ' 次）：' + ((err && err.message) || '未知错误'));
      reportStatus('error', this.stats.done, Scan.entries.length, (err && err.message) || '未知错误');
      return;
    }
    for (let i = 0; i < live.length; i++) {
      const u = live[i];
      if (u.entry._plan && !u.entry._failed) u.entry._plan.results[u.idx] = out[i] == null ? '' : String(out[i]);
    }
    for (const entry of entries) {
      const plan = entry._plan;
      if (!plan || entry.done || entry._failed) continue;
      if (plan.results.some(r => r == null)) continue;
      const val = joinParts(plan.results, Cfg.tgtLang);
      /* 免译规则 2 兜底：拼接后仍与原文一致 → 不渲染 */
      const final = sameTranslation(entry.text, val) ? '' : val;
      if (final || plan.results.length) {
        fillTrans(entry, final);
        this.stats.done++;
      } else {
        entry._failed = true;
        this.stats.fail++;
        this.fail(entry.key);
      }
    }
    reportStatus(State.translated ? 'done' : 'progress', this.stats.done, Scan.entries.length);
  }
};

/* ================= 扫描 / 懒加载 / 动态内容 ================= */
const Scan = {
  observer: null,
  mo: null,
  entries: [],

  run(root) {
    if (!gateOpen()) return;
    if (!root || !root.isConnected) return;
    applyXPathMarks(root);
    const segs = collectSegments(root);
    for (const seg of segs) {
      const text = segText(seg);
      if (!translatable(text)) continue;
      const entry = wrapSegment(seg);
      if (!entry) continue;
      this.entries.push(entry);
      if (Cfg.scope === 'lazy') this.observe(entry);
      else Queue.add(entry);
    }
  },

  observe(entry) {
    if (!this.observer) {
      const ahead = clamp(+Cfg.lazyAhead || 0, 0, 10);
      const margin = '200px 0px ' + (ahead * 100) + '% 0px';
      this.observer = new IntersectionObserver((items) => {
        for (const it of items) {
          if (!it.isIntersecting) continue;
          const entry = it.target._tlEntry;
          if (entry && !entry.done) Queue.add(entry);
          this.observer.unobserve(it.target);
        }
      }, { rootMargin: margin });
    }
    entry.origs[0]._tlEntry = entry;
    this.observer.observe(entry.origs[0]);
  },

  resetObserver() {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    if (gateOpen() && State.on && Cfg.scope === 'lazy') this.observeAll();
  },

  observeAll() {
    for (const e of this.entries) if (!e.done) this.observe(e);
  },

  startMutation() {
    if (this.mo) return;
    this.mo = new MutationObserver(debounce(() => {
      if (!gateOpen() || !State.on) return;
      this.run(document.body);
    }, 600));
    this.mo.observe(document.body, { childList: true, subtree: true });
  },

  stopMutation() {
    if (this.mo) { this.mo.disconnect(); this.mo = null; }
    if (this.observer) { this.observer.disconnect(); }
  }
};

/* ================= 指译（事件最小化） ================= */
function applyPeekAttr(entry) {
  const state = entry._peekTmp || entry._peek || null;
  const nodes = (entry.origs || []).concat(entry.trans ? [entry.trans] : []);
  for (const n of nodes) {
    if (!n || !n.isConnected) continue;
    if (state) n.setAttribute('data-tl-peek', state);
    else n.removeAttribute('data-tl-peek');
  }
}
function setEntryPeek(entry, state) {
  if (!entry) return;
  entry._peek = state || null;
  applyPeekAttr(entry);
}
function clearPeek() {
  for (const e of Scan.entries) {
    if (e._peek || e._peekTmp) {
      e._peek = null; e._peekTmp = null;
      applyPeekAttr(e);
    }
  }
  Peek.holdEntries = [];
  Peek.holdActive = false;
}
function entryShowsOrig(entry) {
  const s = entry._peekTmp || entry._peek;
  if (s === 'orig') return true;
  if (s === 'tgt' || s === 'bi') return false;
  if (!State.on) return true;
  return Cfg.mode === 'orig';
}
function peekParaOf(el) {
  let cur = el && el.nodeType === 1 ? el : (el && el.parentElement);
  while (cur && cur !== document.documentElement && cur !== document.body) {
    if (cur.hasAttribute && (cur.hasAttribute('data-tl-orig') || cur.hasAttribute('data-tl-trans'))) {
      cur = cur.parentElement;
      continue;
    }
    if (breaksLine(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}
function peekTargetsAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || el.nodeType !== 1 || !el.closest) return [];
  const hit = el.closest('[data-tl-orig], [data-tl-trans]');
  const para = peekParaOf(hit || el);
  if (!hit && para && !para._tlPeekScanned) {
    para._tlPeekScanned = true;
    applyXPathMarks(para);
    for (const seg of collectSegments(para)) {
      const text = segText(seg);
      if (!translatable(text)) continue;
      const entry = wrapSegment(seg);
      if (entry) Scan.entries.push(entry);
    }
  }
  const scope = para || (hit && hit.parentElement) || null;
  const out = [];
  for (const e of Scan.entries) {
    if (!e.trans || !e.trans.isConnected) continue;
    if (scope && (scope.contains(e.trans) || (e.origs[0] && scope.contains(e.origs[0])))) out.push(e);
  }
  if (!out.length && hit) {
    const entry = hit._tlEntry || null;
    if (entry) out.push(entry);
  }
  for (const e of out) if (!e.done) Queue.add(e);
  return out;
}
const Peek = {
  lastPress: 0,
  holdTimer: 0,
  holdActive: false,
  holdEntries: [],
  mouseX: 0,
  mouseY: 0,

  bind() {
    const isTrigger = (e) => e.code === Cfg.peekKey || (Cfg.peekKey === 'CapsLock' && e.key === 'CapsLock');

    /* 仅记录鼠标位置（bubble + passive，不进捕获链）；指译只由触发键驱动 */
    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    }, { passive: true });

    if (!Cfg.peekDbl && !Cfg.peekHold) return; // 指译关闭则不挂键盘监听

    document.addEventListener('keydown', (e) => {
      if (!gateOpen()) return;
      if (isTypingTarget(e.target)) return;
      if (!isTrigger(e)) {
        this.lastPress = 0;
        if (this.holdActive) this.release();
        return;
      }
      if (e.repeat) return;
      e.preventDefault(); // CapsLock 双击不切换大小写（仅触发键）
      const now = Date.now();
      if (Cfg.peekDbl && this.lastPress && now - this.lastPress < 380) {
        this.lastPress = 0;
        if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = 0; }
        this.toggle();
        return;
      }
      this.lastPress = Cfg.peekDbl ? now : 0;
      if (Cfg.peekHold && !this.holdActive && !this.holdTimer) {
        this.holdTimer = setTimeout(() => {
          this.holdTimer = 0;
          this.lastPress = 0;
          this.holdActivate();
        }, clamp(+Cfg.peekHoldMs || 400, 150, 1500));
      }
    });

    document.addEventListener('keyup', (e) => {
      if (!gateOpen()) return;
      if (!isTrigger(e)) return;
      if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = 0; }
      if (this.holdActive) this.release();
    });

    window.addEventListener('blur', () => {
      this.lastPress = 0;
      if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = 0; }
      if (this.holdActive) this.release();
    });
  },

  flipTargets() {
    const targets = peekTargetsAt(this.mouseX, this.mouseY);
    if (!targets.length) return null;
    return { targets, toOrig: !entryShowsOrig(targets[0]) };
  },
  toggle() {
    const r = this.flipTargets();
    if (!r) return;
    for (const e of r.targets) setEntryPeek(e, r.toOrig ? 'orig' : (Cfg.biPref ? 'bi' : 'tgt'));
  },
  holdActivate() {
    const r = this.flipTargets();
    if (!r) return;
    this.holdActive = true;
    this.holdEntries = r.targets;
    for (const e of r.targets) {
      e._peekTmp = r.toOrig ? 'orig' : (Cfg.biPref ? 'bi' : 'tgt');
      applyPeekAttr(e);
    }
  },
  release() {
    this.holdActive = false;
    for (const e of this.holdEntries) {
      e._peekTmp = null;
      applyPeekAttr(e);
    }
    this.holdEntries = [];
  }
};

/* DOM 工具（core 无 DOM 版本） */
function isTypingTarget(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
}

/* ================= 总开关 / 自动翻译 ================= */
const State = { on: false, translated: false, dead: false };

/* 总闸关闭：页面零注入、还原原文、清空所有标记，并拒绝一切后续指令 */
function destroyContent() {
  if (State.dead) return;
  State.dead = true;
  State.on = false;
  State.translated = false;
  Queue.reset();
  Scan.stopMutation();
  if (Scan.observer) { Scan.observer.disconnect(); Scan.observer = null; }
  for (const e of Scan.entries.slice()) {
    try { unwrapEntry(e); } catch (err) { /* 节点已移除 */ }
  }
  Scan.entries = [];
  const html = document.documentElement;
  html.removeAttribute('data-tl-active');
  html.removeAttribute('data-tl-mode');
  const marks = ['data-tl-trans', 'data-tl-orig', 'data-tl-ready', 'data-tl-peek',
    'data-tl-busy', 'data-tl-tgt-only', 'data-tl-block', 'data-tl-inline'];
  for (const n of document.querySelectorAll('[data-tl-trans], [data-tl-orig], [data-tl-peek]')) {
    for (const a of marks) n.removeAttribute(a);
  }
  removeRenderCSS();
  Peek.release();
  sessionUnmark();
  reportStatus('idle', 0, 0);
}
/* 总闸重新开启：驻留脚本复活（重新注入渲染样式，按规则决定是否自动翻译） */
function reviveContent() {
  if (!State.dead) return;
  State.dead = false;
  injectRenderCSS();
  document.documentElement.setAttribute('data-tl-mode', Cfg.mode);
  if (Cfg.globalMode !== 'off' && (sessionMarked() || shouldAutoTranslate(Cfg, location.href, detectPageLang()))) enable();
  /* 手动范围=当前域名：总闸重开后重新查询会话级域名标记 */
  if (Cfg.manualScope === 'domain') queryDomainOnStart();
}
function gateOpen() { return !State.dead && Cfg.globalMode !== 'off'; }

/* ================= 手动翻译范围：当前页 / 当前域名 ================= */
function markManualScope() {
  if (Cfg.manualScope !== 'domain') return;
  try {
    browser.runtime.sendMessage({ type: 'markDomain', host: location.hostname }).catch(() => {});
  } catch (e) { /* 忽略 */ }
}
function queryDomainOnStart() {
  try {
    browser.runtime.sendMessage({ type: 'queryDomain', host: location.hostname })
      .then(r => { if (r && r.marked && gateOpen() && !State.on) enable(); })
      .catch(() => {});
  } catch (e) { /* 忽略 */ }
}

function sessionMark() {
  try { sessionStorage.setItem('tl_session_auto', location.origin); }
  catch (e) { window.__tlSessionAuto = location.origin; }
}
function sessionUnmark() {
  try { sessionStorage.removeItem('tl_session_auto'); }
  catch (e) { window.__tlSessionAuto = ''; }
}
function sessionMarked() {
  try { return sessionStorage.getItem('tl_session_auto') === location.origin; }
  catch (e) { return window.__tlSessionAuto === location.origin; }
}

function enable() {
  if (!gateOpen()) return;
  State.on = true;
  State.translated = true;
  sessionMark();
  document.documentElement.setAttribute('data-tl-active', '1');
  if (Cfg.mode === 'orig') setMode(Cfg.biPref ? 'bi' : 'target', true);
  Scan.startMutation();
  if (Cfg.scope === 'lazy') {
    Scan.run(document.body);
    Scan.observeAll();
  } else {
    Scan.run(document.body);
    Scan.entries.forEach(e => Queue.add(e));
  }
}
function disable() {
  State.on = false;
  State.translated = false;
  sessionUnmark();
  document.documentElement.removeAttribute('data-tl-active');
  Scan.stopMutation();
  clearAll();
}
function clearAll() {
  for (const entry of Scan.entries) {
    if (entry.trans && entry.trans.isConnected) unwrapEntry(entry);
  }
  Scan.entries = Scan.entries.filter(e => e.trans && e.trans.isConnected);
  Queue.reset();
  State.translated = false;
}
function translatePageNow() {
  if (!gateOpen()) return;
  State.on = true;
  State.translated = true;
  sessionMark();
  document.documentElement.setAttribute('data-tl-active', '1');
  if (Cfg.mode === 'orig') setMode(Cfg.biPref ? 'bi' : 'target', true);
  Scan.startMutation();
  markManualScope(); // 手动触发：domain 模式登记主机名并让同域其它页自动翻译
  Scan.run(document.body);
  if (Cfg.scope === 'lazy') Scan.observeAll();
  else Scan.entries.forEach(e => Queue.add(e));
  toast(Cfg.scope === 'lazy' ? '开始翻译可视区域…' : '开始翻译本页…');
  reportStatus('progress', Queue.stats.done, Scan.entries.length);
}

function serviceConfigured() {
  const eng = Cfg.engine;
  if (eng === 'microsoft') return true;
  if (eng === 'baidu') return !!(Cfg.baidu.appid && Cfg.baidu.secret);
  return relayModels(Cfg.models, Cfg.quickModel).length > 0;
}

/* 底部主按钮 / 快捷键（不受全局开关影响） */
function primaryAction() {
  if (!gateOpen()) return;
  if (!State.translated) {
    if (!serviceConfigured()) {
      toast('请先在面板中配置翻译服务');
      reportStatus('error', 0, 0, '未配置翻译服务');
      return;
    }
    translatePageNow();
    return;
  }
  if (Cfg.mode === 'orig') {
    setMode(Cfg.biPref ? 'bi' : 'target');
    toast('显示译文');
  } else {
    setMode('orig');
    toast('显示原文');
  }
}

/* ================= 来自 popup / 快捷键的指令 ================= */
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.cmd) return;
  if (msg.cmd === 'ping') { sendResponse({ ok: true, installed: true, dead: State.dead }); return true; }
  if (msg.cmd === 'destroy') { destroyContent(); return; }
  if (msg.cmd === 'revive') { reviveContent(); return; }
  if (!gateOpen()) return;
  if (msg.cmd === 'primaryAction') primaryAction();
  else if (msg.cmd === 'toggleBi') toggleBiPref();
  else if (msg.cmd === 'getState') {
    sendResponse({ translated: State.translated, mode: Cfg.mode, biPref: !!Cfg.biPref, on: State.on });
    return true;
  }   else if (msg.cmd === 'domainAuto') {
    if (msg.host === location.hostname && gateOpen() && !State.on) enable();
  }
  else if (msg.cmd === 'applyConfig') {
    Scan.resetObserver();
    refreshXPathMarks();
  }
});

/* ================= 初始化 ================= */
(async () => {
  try {
    const o = await browser.storage.local.get('tl_config_v1');
    Object.keys(Cfg).forEach(k => { delete Cfg[k]; });
    Object.assign(Cfg, parseConfig(o.tl_config_v1 || ''));
  } catch (e) { /* 保持默认 */ }
  refreshRegexRules();                                  // 初始规则已在扫描时求值
  lastXpSig = JSON.stringify(Cfg.behaviorRules || []);
  if (Cfg.globalMode === 'off') { State.dead = true; return; } // 总闸关闭：零注入
  injectRenderCSS();
  document.documentElement.setAttribute('data-tl-mode', Cfg.mode);
  Peek.bind();
  /* 自动翻译：会话记忆优先；否则 globalMode='on' 且两独立自动开关任一命中 */
  if (sessionMarked()) { enable(); return; }
  if (shouldAutoTranslate(Cfg, location.href, detectPageLang())) enable();
  /* 手动范围=当前域名：本页初始化时查询会话级域名标记 */
  if (Cfg.manualScope === 'domain') queryDomainOnStart();
})();
} /* /重复注入守卫 */
