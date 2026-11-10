/* popup.js — TransLite · 轻译 弹出主控台（依赖 ../lib/core.js 先行载入） */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* 下拉项用 DOM API 构建，不用 innerHTML 拼接，避免动态 HTML 注入告警。
 * items: [[value, label], ...] */
function setOptions(sel, items) {
  sel.replaceChildren(...items.map(([value, label]) => new Option(label, value)));
}

let Cfg = parseConfig('');
let activeTabId = null;
let editingModel = -1;
let resetArmed = false;
let tipBubble = null;
let currentHref = '';              // 当前标签页 URL（提示词站点套用显示用）
let promptEditor = null;           // { mode:'new'|'edit', id }（new 自动带入当前生效模板）

function save() {
  browser.storage.local.set({ tl_config_v1: serializeConfig(Cfg) });
  if (activeTabId != null) {
    browser.tabs.sendMessage(activeTabId, { cmd: 'applyConfig' }).catch(() => {});
  }
}

/* 行内输入：点击 chip/按钮时原地替换成 input，Enter 确认 / Esc 或失焦取消。
 * 取代扩展弹出面板中易被抑制的 window.prompt()。 */
function inlineInput(anchor, initial, onOk, placeholder) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'inline-input';
  inp.value = initial || '';
  inp.placeholder = placeholder || '';
  inp.title = 'Enter 确认 · Esc 取消';
  anchor.replaceWith(inp);
  inp.focus(); inp.select();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    const v = inp.value.trim();
    if (inp.parentNode) inp.replaceWith(anchor);
    if (ok && v) onOk(v);
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(false));
}

/* ================= 标签页切换 ================= */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.pane').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $('#pane-' + t.dataset.pane).classList.add('active');
  hideTip();
  $('.p-body').scrollTop = 0; // 切换标签回到顶部，避免沿用上一个标签的滚动位置
  if (t.dataset.pane === 'settings') refreshCacheInfo();
}));

function goTab(name) {
  $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.pane === name));
  $$('.pane').forEach(x => x.classList.toggle('active', x.id === 'pane-' + name));
  hideTip();
  $('.p-body').scrollTop = 0;
  if (name === 'models') renderModels();
}

/* 翻译页「＋ 新建模板」入口：跳到模型页提示词模板区并打开编辑区 */
function gotoPromptEditor(mode, src) {
  goTab('models');
  const body = $('.p-body'), anchor = $('#promptSecTitle');
  if (body && anchor) {
    const br = body.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    body.scrollTop += ar.top - br.top - 10;
  }
  openPromptEditor(mode || 'new', src || null);
  const ni = $('#promptName');
  if (ni) ni.focus({ preventScroll: true });
}

/* ================= 提示气泡（fixed 动态锚定，不被滚动容器裁剪/溢出） ================= */
function hideTip() {
  if (tipBubble && tipBubble.parentNode) tipBubble.parentNode.removeChild(tipBubble);
  tipBubble = null;
}
function showTip(el) {
  hideTip();
  const txt = el.getAttribute('data-tip') || '';
  if (!txt) return;
  const b = document.createElement('div');
  b.className = 'tip-bubble';
  b.textContent = txt;
  document.body.appendChild(b);
  const r = el.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let left = r.left + r.width / 2 - bw / 2;
  left = Math.max(8, Math.min(left, W - bw - 8));
  let top = r.top - bh - 8;
  if (top < 8) top = Math.min(H - bh - 8, r.bottom + 8);
  b.style.left = left + 'px';
  b.style.top = Math.max(8, top) + 'px';
  tipBubble = b;
}
function bindTips() {
  $$('.tip').forEach(t => {
    t.addEventListener('mouseenter', () => showTip(t));
    t.addEventListener('mouseleave', hideTip);
  });
}

/* ================= 面板尺寸可调（拖动右下角，双击恢复默认） ================= */
const MIN_W = 340, MAX_W = 720, MIN_H = 380, MAX_H = 900;
function applyPanelSize() {
  const w = Cfg.popupW > 0 ? clamp(+Cfg.popupW, MIN_W, MAX_W) : 360;
  const h = Cfg.popupH > 0 ? clamp(+Cfg.popupH, MIN_H, MAX_H) : 560;
  const root = document.documentElement.style;
  root.setProperty('--pw', w + 'px');
  root.setProperty('--ph', h + 'px');
}
function bindResize() {
  const grip = $('#resizeGrip');
  let dragging = false, sx = 0, sy = 0, sw = 0, sh = 0;
  grip.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    sw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pw'), 10) || 360;
    sh = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ph'), 10) || 560;
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = clamp(sw + (e.clientX - sx), MIN_W, MAX_W);
    const h = clamp(sh + (e.clientY - sy), MIN_H, MAX_H);
    document.documentElement.style.setProperty('--pw', w + 'px');
    document.documentElement.style.setProperty('--ph', h + 'px');
    hideTip();
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    Cfg.popupW = parseInt(document.documentElement.style.getPropertyValue('--pw'), 10) || 0;
    Cfg.popupH = parseInt(document.documentElement.style.getPropertyValue('--ph'), 10) || 0;
    save();
  });
  grip.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    Cfg.popupW = 0; Cfg.popupH = 0;
    applyPanelSize(); save();
  });
}

/* ================= 翻译页 ================= */
function renderGlobal() {
  const on = Cfg.globalMode === 'on';
  $('#globalSw').classList.toggle('on', on);
  /* 不再对自动翻译板块做半透明处理 */
  refreshStatus();
}

function renderEngines() {
  $$('#engineRow .ecard').forEach(c => c.classList.toggle('active', c.dataset.engine === Cfg.engine));
  $('#baiduCfg').classList.toggle('hidden', Cfg.engine !== 'baidu');
  $('#llmQuick').classList.toggle('hidden', Cfg.engine !== 'llm');
  $('#quickHint').classList.toggle('hidden', Cfg.engine !== 'llm');
  $('#baiduAppid').value = Cfg.baidu.appid || '';
  $('#baiduSecret').value = Cfg.baidu.secret || '';

  /* 模型快捷按钮：仅启用且已配置；初始不选中任何模型 */
  const rel = relayModels(Cfg.models, Cfg.quickModel);
  const mb = $('#quickModelBtns');
  mb.innerHTML = '';
  if (!rel.length) {
    const b = document.createElement('span');
    b.className = 'qbtn empty';
    b.textContent = '未配置模型';
    mb.appendChild(b);
  } else {
    for (const m of rel) {
      const b = document.createElement('button');
      b.className = 'qbtn' + (Cfg.quickModel === m.id ? ' active' : '');
      b.textContent = m.name || m.model || m.id;
      b.title = (m.vendor || guessVendor(m.endpoint)) + ' · ' + (m.model || '');
      b.addEventListener('click', () => {
        Cfg.quickModel = (Cfg.quickModel === m.id) ? '' : m.id; // 再次点击取消选择
        save(); renderEngines(); renderModels();
      });
      mb.appendChild(b);
    }
  }
  $('#quickHint').textContent = rel.length
    ? '单击选中即设为首选（接力 #1），再次单击取消；未配置的模型不参与接力。'
    : '请先在「模型」页填写 API Key；初始不选中任何模型。';

  /* 提示词卡片：纯选择器（单一模板库），末尾「＋ 新建模板」入口 */
  renderPromptButtons();
}

function renderLang() {
  const box = $('#langChips');
  box.innerHTML = '';
  for (const code of Cfg.sourceLangList) {
    const on = Cfg.sourceLang.indexOf(code) >= 0;
    const c = document.createElement('span');
    c.className = 'chip' + (on ? ' on' : ' off');
    c.textContent = langName(code);
    c.title = '单击' + (on ? '停用' : '启用') + ' · 右击移除';
    /* 单击切换该语言启用/停用；右击从列表移除 */
    c.addEventListener('click', () => {
      const i = Cfg.sourceLang.indexOf(code);
      if (i >= 0) Cfg.sourceLang.splice(i, 1);
      else Cfg.sourceLang.push(code);
      save(); renderLang();
    });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      Cfg.sourceLangList = Cfg.sourceLangList.filter(x => x !== code);
      Cfg.sourceLang = Cfg.sourceLang.filter(x => x !== code);
      save(); renderLang();
    });
    box.appendChild(c);
  }

  /* 下拉快速添加：列出尚未显示的常用语言 */
  const quick = $('#langQuick');
  const choices = Object.keys(LANG_ALIASES).filter(c => Cfg.sourceLangList.indexOf(c) < 0);
  setOptions(quick, [['', '快速添加…']].concat(
    choices.map(c => [c, LANG_NAMES[c] || c.toUpperCase()])));
  quick.disabled = !choices.length;

  const tl = $('#tgtLang');
  setOptions(tl, Object.keys(LANG_LABELS).filter(k => k !== 'auto')
    .map(k => [k, LANG_LABELS[k]]));
  tl.value = Cfg.tgtLang;
}

function addLangCode(raw) {
  const v = String(raw || '').trim();
  if (!v) return;
  const code = parseLangInput(v) || v.toLowerCase(); // 任意语言代码也接受
  if (!code) return;
  if (Cfg.sourceLangList.indexOf(code) < 0) Cfg.sourceLangList.push(code);
  if (Cfg.sourceLang.indexOf(code) < 0) Cfg.sourceLang.push(code);
  save(); renderLang();
}

function renderScope() {
  $$('#scopeRow button').forEach(b => b.classList.toggle('active', b.dataset.scope === Cfg.scope));
  const aheadOn = (+Cfg.lazyAhead || 0) > 0;
  $('#aheadSw').classList.toggle('on', aheadOn);
  $('#aheadN').value = Math.max(1, +Cfg.lazyAhead || 1);
  $('#aheadRow').style.opacity = Cfg.scope === 'lazy' ? '1' : '.42';
}

function renderAuto() {
  $('#autoAllSw').classList.toggle('on', Cfg.autoAll !== false);
  $('#autoSiteSw').classList.toggle('on', Cfg.autoSiteOn !== false);
  const box = $('#siteChips');
  box.innerHTML = '';
  for (const r of Cfg.autoSites) {
    const on = r.enabled !== false;
    const c = document.createElement('span');
    c.className = 'chip site' + (on ? ' on' : ' off');
    c.textContent = r.pattern;
    c.title = '单击' + (on ? '停用' : '启用') + ' · 右击移除';
    c.addEventListener('click', () => {
      r.enabled = !on;
      save(); renderAuto();
    });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      Cfg.autoSites = Cfg.autoSites.filter(x => x !== r);
      save(); renderAuto();
    });
    box.appendChild(c);
  }
  const add = document.createElement('span');
  add.className = 'chip add';
  add.textContent = '＋ 添加当前站点';
  add.title = '单击添加当前站点；已有项单击启停、右击移除';
  add.addEventListener('click', async () => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      let host = '';
      try { host = new URL(tabs[0].url || '').hostname.toLowerCase(); } catch (e) { /* about: 等 */ }
      if (!host) return;
      inlineInput(add, host, pat => {
        Cfg.autoSites.push({ pattern: pat, enabled: true });
        save(); renderAuto();
      }, '站点规则（支持 *.example.com）');
    } catch (e) { /* 忽略 */ }
  });
  box.appendChild(add);
}

/* ================= 模型页 ================= */
function renderModels() {
  const list = $('#modelList');
  list.innerHTML = '';
  const rel = relayModels(Cfg.models, Cfg.quickModel);
  Cfg.models.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'mrow';
    const configured = modelConfigured(m);
    const relayIdx = rel.indexOf(m);
    let badge = '', bcls = 'mbadge warn';
    if (!configured) { badge = '未配置 · 不参与接力'; }
    else if (m.enabled === false) { badge = '已禁用'; bcls = 'mbadge off'; }
    else if (relayIdx >= 0) {
      badge = relayIdx === 0 ? '首选 · 接力 #1' : '接力 #' + (relayIdx + 1);
      bcls = 'mbadge ok';
    }
    row.innerHTML =
      '<div class="sw' + (m.enabled !== false ? ' on' : '') + '"></div>' +
      '<div class="m-main"><div class="m-name"></div><div class="m-meta"></div></div>' +
      '<span class="' + bcls + '"></span>' +
      '<span class="m-ops"><span class="op-edit" title="编辑">✏️</span> <span class="op-del" title="删除">🗑️</span></span>';
    row.querySelector('.m-name').textContent = m.name || m.model || '（未命名）';
    /* 列表不显示接入点，只显示服务商名称 + 模型名 */
    row.querySelector('.m-meta').textContent = (m.vendor || guessVendor(m.endpoint)) + ' · ' + (m.model || '—');
    row.querySelector('.mbadge').textContent = badge;
    row.querySelector('.sw').addEventListener('click', () => {
      m.enabled = (m.enabled === false);
      save(); renderModels(); renderEngines();
    });
    row.querySelector('.op-edit').addEventListener('click', () => openModelEdit(i));
    const delEl = row.querySelector('.op-del');
    delEl.addEventListener('click', () => {
      if (delEl.dataset.confirm !== '1') {
        delEl.dataset.confirm = '1'; delEl.textContent = '确认?'; delEl.title = '再次点击确认删除';
        setTimeout(() => {
          if (delEl.isConnected) { delEl.dataset.confirm = ''; delEl.textContent = '🗑️'; delEl.title = '删除'; }
        }, 3000);
        return;
      }
      Cfg.models.splice(i, 1);
      save(); renderModels(); renderEngines();
    });
    list.appendChild(row);
  });

  $('#cfgConc').value = Cfg.concurrency;
  $('#cfgInterval').value = Cfg.callInterval;
  $('#cfgTimeout').value = Math.round((Cfg.replyTimeout || 90000) / 1000);
  $('#cfgRetry').value = Cfg.retryCount;
  $('#cfgMaxSegs').value = Cfg.maxBatchSegs;
  $('#cfgMaxChars').value = Cfg.maxBatchChars;
  renderPromptLibrary();
}

/* ================= 提示词模板库（v1.4：单一模板库 + 一个编辑区） ================= */
/* 单一事实来源 Cfg.prompts（内置 3 条已实体化、可编辑站点与正文，仅不可删除）。
 * 名称只在编辑区出现一次；新建模板直接带入当前生效模板（含站点），故不再逐行放「以此新建」。 */
function sitePromptNow() {
  try { return promptForSite(Cfg, currentHref); } catch (e) { return null; }
}
function renderPromptButtons() {
  const pb = $('#quickPromptBtns');
  if (!pb) return;
  pb.innerHTML = '';
  const siteP = sitePromptNow();
  for (const p of allPrompts(Cfg)) {
    const b = document.createElement('button');
    const active = (Cfg.promptPreset || 'general') === p.id;
    const siteActive = !!(siteP && siteP.id === p.id);
    b.className = 'qbtn' + (active ? ' active' : '') + (siteActive ? ' site-active' : '');
    b.textContent = p.name;
    b.title = siteActive ? '当前站点自动套用此模板' : '设为全局提示词';
    b.addEventListener('click', () => {
      Cfg.promptPreset = p.id;
      save(); renderEngines(); renderPromptLibrary();
    });
    pb.appendChild(b);
  }
  const add = document.createElement('button');
  add.className = 'qbtn entry';
  add.textContent = '＋ 新建模板';
  add.title = '基于当前生效模板新建（含适用站点）';
  add.addEventListener('click', () => gotoPromptEditor('new'));
  pb.appendChild(add);
  const hint = $('#promptSiteHint');
  if (hint) hint.textContent = siteP ? ('当前站点生效：' + siteP.name) : '';
}
function renderPromptLibrary() {
  const box = $('#promptList');
  if (!box) return;
  box.innerHTML = '';
  const siteP = sitePromptNow();
  for (const p of allPrompts(Cfg)) {
    const row = document.createElement('div');
    row.className = 'tpl-row';
    const nm = document.createElement('span');
    nm.className = 'tpl-name'; nm.textContent = p.name; nm.title = p.name;
    row.appendChild(nm);
    const tag = (text, cls, title) => {
      const t = document.createElement('span');
      t.className = 'tpl-tag' + (cls ? ' ' + cls : '');
      t.textContent = text; t.title = title || text;
      row.appendChild(t);
    };
    if ((Cfg.promptPreset || 'general') === p.id) tag('全局', '', '全局设置');
    if (p.site) tag(p.site, 'site', '适用站点：' + p.site);
    if (siteP && siteP.id === p.id) tag('本页', 'site', '当前站点自动套用');
    const btn = (text, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'tpl-btn' + (cls ? ' ' + cls : '');
      b.textContent = text; b.addEventListener('click', fn);
      row.appendChild(b); return b;
    };
    btn('选用', '', () => {
      Cfg.promptPreset = p.id;
      save(); renderEngines(); renderPromptLibrary();
    });
    /* v1.4：内置模板也允许编辑（主要用于适配站点规则），仅不允许删除 */
    btn('编辑', '', () => { openPromptEditor('edit', p); $('#promptName').focus({ preventScroll: true }); });
    if (!p.builtin) {
      const del = btn('✕', 'del', () => {
        if (del.dataset.confirm !== '1') {
          del.dataset.confirm = '1'; del.textContent = '确认?';
          setTimeout(() => { if (del.isConnected) { del.dataset.confirm = ''; del.textContent = '✕'; } }, 3000);
          return;
        }
        Cfg.prompts = (Cfg.prompts || []).filter(x => x.id !== p.id);
        if (Cfg.promptPreset === p.id) Cfg.promptPreset = 'general';
        save(); renderEngines(); renderPromptLibrary();
      });
      del.title = '删除模板（需二次点击确认）';
    }
    box.appendChild(row);
  }
  const hint = $('#promptSiteHint');
  if (hint) hint.textContent = siteP ? ('当前站点生效：' + siteP.name) : '';
}
/* 当前生效模板：站点模板优先，否则全局选中；新建模板以此为蓝本（含站点） */
function currentPromptSource() {
  const list = allPrompts(Cfg);
  const id = activePromptId(Cfg, currentHref);
  return list.find(p => p.id === id) || list[0] || null;
}
function openPromptEditor(mode, src) {
  if (mode === 'new') src = currentPromptSource();
  promptEditor = { mode, id: src && src.id };
  $('#promptEditor').classList.remove('hidden');
  $('#promptEditorTitle').textContent = mode === 'edit' ? '编辑模板' : '基于当前模板新建';
  $('#promptName').value = mode === 'edit'
    ? ((src && src.name) || '')
    : ((src && src.name ? src.name : '模板') + '（副本）');
  $('#promptSite').value = (src && src.site) || '';
  $('#promptText').value = (src && src.text) || '';
  $('#promptMsg').textContent = '';
}
function closePromptEditor() {
  promptEditor = null;
  $('#promptEditor').classList.add('hidden');
  $('#promptMsg').textContent = '';
}
function savePromptEditor() {
  if (!promptEditor) return;
  const name = ($('#promptName').value || '').trim().slice(0, 40);
  const text = ($('#promptText').value || '').trim();
  const site = ($('#promptSite').value || '').trim();
  if (!name) { $('#promptMsg').textContent = '请填写模板名称'; return; }
  if (!text) { $('#promptMsg').textContent = '请填写提示词正文'; return; }
  /* 站点可用 , 或 ; 分隔多个；分隔符后的空格允许，单个站点项内部不允许空格 */
  if (site && site.split(/[,;，；]/).some(x => /\s/.test(x.trim()))) {
    $('#promptMsg').textContent = '单个站点不能包含空格'; return;
  }
  const list = Cfg.prompts || (Cfg.prompts = []);
  if (promptEditor.mode === 'edit') {
    const p = list.find(x => x.id === promptEditor.id);
    if (p) { p.name = name; p.text = text; p.site = site; }
  } else {
    list.push({ id: 'u' + Date.now(), name, text, site, enabled: true });
  }
  closePromptEditor();
  save(); renderEngines(); renderPromptLibrary();
}

function openModelEdit(i) {
  editingModel = i;
  const m = i >= 0 ? Cfg.models[i] : { id: 'm-' + Date.now(), name: '', vendor: '', endpoint: '', model: '', key: '', conc: 0, maxTok: 0, enabled: true, fails: 0 };
  $('#modelEdit').classList.remove('hidden');
  $('#modelEditTitle').textContent = i >= 0 ? '编辑模型' : '添加模型';
  $('#meName').value = m.name || '';
  $('#meVendor').value = m.vendor || '';
  $('#meEndpoint').value = m.endpoint || '';
  $('#meModel').value = m.model || '';
  $('#meKey').value = m.key || '';
  $('#meMaxTok').value = m.maxTok || 0;
  $('#meConc').value = m.conc || 0;
  $('#meMsg').textContent = '';
  const pv = $('#meProvider');
  setOptions(pv, [['', '服务商快选…']].concat(PROVIDERS.map(p => [p.id, p.name])));
}

/* ================= 设置页 ================= */
function renderSettings() {
  $('#peekDblSw').classList.toggle('on', Cfg.peekDbl !== false);
  $('#peekHoldSw').classList.toggle('on', Cfg.peekHold !== false);
  $('#badgeSw').classList.toggle('on', Cfg.badgeEnabled !== false);
  const pk = $('#peekKey');
  setOptions(pk, Object.keys(PEEK_KEYS).map(k => [k, PEEK_KEYS[k]]));
  pk.value = Cfg.peekKey;
  $('#peekHoldMs').value = Cfg.peekHoldMs;
  $$('#manualScopeRow button').forEach(b =>
    b.classList.toggle('active', b.dataset.scope === (Cfg.manualScope || 'page')));
  renderBehaviorRules();
  refreshCacheInfo();
  if (typeof browser === 'undefined') return;
  browser.runtime.sendMessage({ type: 'syncStatus' }).then(r => {
    $('#fxSyncSw').classList.toggle('on', !!(r && r.on));
  }).catch(() => {});
}

/* v1.4「翻译行为」规则：与模型列表同款开关/删除；新增 = 在列表插入同结构草稿行。
 * 正则的 ^ 与 $ 固定显示，输入框只填主体；模板下拉一键填入常用表达式。 */
const REGEX_TEMPLATES = [
  { id: '', name: '模板…', expr: '', label: '', flags: '' },
  { id: 'alnum', name: '编号', expr: '(?=[A-Za-z0-9._:/-]*[A-Za-z])(?=[A-Za-z0-9._:/-]*\\d)[A-Za-z0-9._:/-]+', label: '字母数字混编编号', flags: '' },
  { id: 'email', name: '邮件', expr: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+', label: '邮件地址', flags: '' },
  { id: 'url', name: '网址', expr: '(?:https?://|www\\.)[^\\s]+', label: '网址', flags: 'i' },
  { id: 'blank', name: '空白', expr: '', label: '', flags: '' }
];
let draftRule = null;
function normalizeRuleExpr(v) {
  return String(v || '').trim().replace(/^\^/, '').replace(/\$$/, '').trim();
}
function buildRuleRow(r, index, isDraft) {
  const row = document.createElement('div');
  row.className = 'rule-row' + (r.enabled === false ? ' off' : '') + (isDraft ? ' draft' : '');
  row.innerHTML =
    '<div class="sw" title="启用/停用"></div>' +
    '<input type="text" class="r-name" placeholder="规则名称" spellcheck="false">' +
    '<select class="r-mode" title="行为模式"><option value="skip">skip</option><option value="inline">inline</option><option value="trans">trans</option></select>' +
    '<button class="r-del" title="删除规则">🗑️</button>' +
    '<div class="r-break"></div>' +
    '<select class="r-kind" title="匹配方式"><option value="xpath">XPath</option><option value="regex">正则</option></select>' +
    '<input type="text" class="r-site" placeholder="站点（* 全局）" spellcheck="false">' +
    '<input type="text" class="r-flags" placeholder="i/u" spellcheck="false">' +
    '<select class="r-tpl" title="正则模板">' + REGEX_TEMPLATES.map(t =>
      '<option value="' + t.id + '">' + t.name + '</option>').join('') + '</select>' +
    '<div class="r-break"></div>' +
    '<div class="r-exprwrap"><span class="r-anchor" title="整段匹配起始，已固定">^</span>' +
    '<input type="text" class="r-expr" spellcheck="false"><span class="r-anchor" title="整段匹配结束，已固定">$</span></div>' +
    '<div class="r-actions"><button class="btn r-save">保存规则</button><button class="btn r-cancel">取消</button></div>';
  const sw = row.querySelector('.sw');
  sw.classList.toggle('on', r.enabled !== false);
  sw.addEventListener('click', () => {
    r.enabled = r.enabled === false;
    if (!isDraft) save();
    renderBehaviorRules();
  });
  const nameIn = row.querySelector('.r-name');
  nameIn.value = r.name || '';
  nameIn.addEventListener('change', () => {
    r.name = nameIn.value.trim() || ('规则 ' + (index + 1));
    if (!isDraft) save();
  });
  const modeSel = row.querySelector('.r-mode');
  modeSel.value = r.mode || 'skip';
  modeSel.addEventListener('change', () => { r.mode = modeSel.value; if (!isDraft) save(); });
  const kindSel = row.querySelector('.r-kind');
  kindSel.value = r.kind === 'regex' ? 'regex' : 'xpath';
  kindSel.addEventListener('change', () => {
    r.kind = kindSel.value;
    if (r.kind === 'regex') r.flags = r.flags || '';
    else r.flags = '';
    if (!isDraft) save();
    renderBehaviorRules();
  });
  const siteIn = row.querySelector('.r-site');
  siteIn.value = r.site || '*';
  siteIn.title = '站点：* 全局；支持 example.com / *.example.com / 路径通配；多个用 , 或 ; 分隔';
  siteIn.addEventListener('change', () => {
    r.site = siteIn.value.trim() || '*';
    if (!isDraft) save();
  });
  const flagsIn = row.querySelector('.r-flags');
  flagsIn.value = r.flags || '';
  flagsIn.title = '正则 flags（i/m/s/u）；g/y 会被忽略';
  flagsIn.addEventListener('change', () => {
    r.flags = flagsIn.value.replace(/[^imsu]/g, '').slice(0, 4);
    if (!isDraft) save();
  });
  const tplSel = row.querySelector('.r-tpl');
  tplSel.addEventListener('change', () => {
    const t = REGEX_TEMPLATES.find(x => x.id === tplSel.value);
    if (!t || !t.id) return;
    r.expr = t.expr;
    r.flags = t.flags;
    if (!String(r.name || '').trim() && t.label) r.name = t.label;
    if (!isDraft) save();
    renderBehaviorRules();
  });
  const exprIn = row.querySelector('.r-expr');
  exprIn.value = r.expr || '';
  exprIn.title = r.expr || '';
  exprIn.addEventListener('change', () => {
    r.expr = normalizeRuleExpr(exprIn.value);
    if (!isDraft) save();
  });
  const anchors = [...row.querySelectorAll('.r-anchor')];
  const syncVis = () => {
    const rx = r.kind === 'regex';
    flagsIn.hidden = !rx;
    tplSel.hidden = !rx;
    anchors.forEach(a => { a.hidden = !rx; });
    exprIn.placeholder = rx ? '表达式主体（^ 与 $ 已固定）' : 'XPath 表达式';
  };
  syncVis();
  const delBtn = row.querySelector('.r-del');
  delBtn.hidden = isDraft;
  delBtn.addEventListener('click', () => {
    if (delBtn.dataset.confirm !== '1') {
      delBtn.dataset.confirm = '1'; delBtn.textContent = '✓'; delBtn.title = '再次点击确认删除';
      setTimeout(() => {
        if (delBtn.isConnected) { delBtn.dataset.confirm = ''; delBtn.textContent = '🗑️'; delBtn.title = '删除规则'; }
      }, 3000);
      return;
    }
    Cfg.behaviorRules.splice(index, 1);
    save(); renderBehaviorRules();
  });
  const actions = row.querySelector('.r-actions');
  actions.hidden = !isDraft;
  if (isDraft) {
    row.querySelector('.r-save').addEventListener('click', () => {
      const name = String(r.name || '').trim();
      const expr = String(r.expr || '').trim();
      if (!name) { $('#xpMsg').textContent = '请填写规则名称'; return; }
      if (!expr) { $('#xpMsg').textContent = '请填写表达式（或选模板）'; return; }
      if (r.kind === 'regex' && !compileSkipRule(r)) {
        $('#xpMsg').textContent = '正则表达式无效或超过 200 字符'; return;
      }
      Cfg.behaviorRules = (Cfg.behaviorRules || []).concat(Object.assign({}, r, {
        id: 'r' + Date.now(), name, expr, builtin: false
      }));
      draftRule = null;
      $('#xpMsg').textContent = '';
      save(); renderBehaviorRules();
    });
    row.querySelector('.r-cancel').addEventListener('click', () => {
      draftRule = null;
      $('#xpMsg').textContent = '';
      renderBehaviorRules();
    });
  }
  return row;
}
function renderBehaviorRules() {
  const box = $('#xpList');
  if (!box) return;
  box.innerHTML = '';
  (Cfg.behaviorRules || []).forEach((r, i) => box.appendChild(buildRuleRow(r, i, false)));
  if (draftRule) box.appendChild(buildRuleRow(draftRule, -1, true));
}

function refreshCacheInfo() {
  if (typeof browser === 'undefined') return;
  browser.runtime.sendMessage({ type: 'cacheInfo' }).then(r => {
    if (r) $('#cacheInfo').textContent = '已缓存 ' + r.size + ' 条（上限 ' + r.max + '）';
  }).catch(() => {});
}

/* ================= 底部主按钮状态机 ================= */
async function refreshStatus() {
  if (typeof browser === 'undefined') return;
  let st = { translated: false, mode: Cfg.mode, biPref: !!Cfg.biPref };
  if (activeTabId != null) {
    try {
      const r = await browser.tabs.sendMessage(activeTabId, { cmd: 'getState' });
      if (r) st = r;
    } catch (e) { /* 无 content script */ }
  }
  const label = Cfg.globalMode === 'off' ? '总开关已关闭'
    : !st.translated ? '立即翻译本页'
      : (st.mode === 'orig' ? '立即翻译' : '显示原文');
  $('#mainBtnLabel').textContent = label;
  $('#biSw').classList.toggle('on', !!st.biPref);
}

/* ================= 绑定 ================= */
function bindAll() {
  $('#globalSw').addEventListener('click', () => {
    Cfg.globalMode = Cfg.globalMode === 'on' ? 'off' : 'on';
    save(); renderGlobal();
  });

  $$('#engineRow .ecard').forEach(c => c.addEventListener('click', () => {
    Cfg.engine = c.dataset.engine;
    save(); renderEngines();
  }));
  $('#baiduAppid').addEventListener('change', () => { Cfg.baidu.appid = $('#baiduAppid').value.trim(); save(); });
  $('#baiduSecret').addEventListener('change', () => { Cfg.baidu.secret = $('#baiduSecret').value.trim(); save(); });
  $('#testBaidu').addEventListener('click', async () => {
    $('#testBaiduMsg').textContent = '测试中…';
    const r = await browser.runtime.sendMessage({ type: 'testEngine', engine: 'baidu' }).catch(e => ({ ok: false, error: String(e) }));
    $('#testBaiduMsg').textContent = r && r.ok ? '成功：' + r.sample : '失败：' + (r && r.error);
  });
  $('#toModels').addEventListener('click', () => goTab('models'));

  $('#tgtLang').addEventListener('change', () => { Cfg.tgtLang = $('#tgtLang').value; save(); });

  /* 语言：＋ 输入任意代码，下拉快速添加 */
  $('#langAdd').addEventListener('click', () => {
    inlineInput($('#langAdd'), '', v => addLangCode(v), '语言代码（如 nl、sv）');
  });
  $('#langQuick').addEventListener('change', () => {
    if ($('#langQuick').value) { addLangCode($('#langQuick').value); }
  });

  $$('#scopeRow button').forEach(b => b.addEventListener('click', () => {
    Cfg.scope = b.dataset.scope;
    save(); renderScope();
  }));
  $('#aheadSw').addEventListener('click', () => {
    const on = !$('#aheadSw').classList.contains('on');
    Cfg.lazyAhead = on ? Math.max(1, +$('#aheadN').value || 1) : 0;
    save(); renderScope();
  });
  $('#aheadN').addEventListener('change', () => {
    const v = Math.min(10, Math.max(1, +$('#aheadN').value || 1));
    if (Cfg.lazyAhead > 0) Cfg.lazyAhead = v;
    $('#aheadN').value = v;
    save();
  });

  /* 自动翻译：两个独立开关 */
  $('#autoAllSw').addEventListener('click', () => {
    Cfg.autoAll = !(Cfg.autoAll !== false);
    save(); renderAuto();
  });
  $('#autoSiteSw').addEventListener('click', () => {
    Cfg.autoSiteOn = !(Cfg.autoSiteOn !== false);
    save(); renderAuto();
  });

  /* 模型编辑 */
  $('#addModel').addEventListener('click', () => openModelEdit(-1));
  $('#meCancel').addEventListener('click', () => {
    $('#modelEdit').classList.add('hidden');
    editingModel = -1;
  });
  $('#meProvider').addEventListener('change', () => {
    const p = PROVIDERS.find(x => x.id === $('#meProvider').value);
    if (!p) return;
    if (p.endpoint) $('#meEndpoint').value = p.endpoint;
    if (p.model) $('#meModel').value = p.model;
    if (!$('#meName').value && p.name) $('#meName').value = p.name;
    if (!$('#meVendor').value && p.name && p.id !== 'custom') $('#meVendor').value = p.name;
  });
  $('#meProbe').addEventListener('click', async () => {
    $('#meMsg').textContent = '探测中…';
    const r = await browser.runtime.sendMessage({ type: 'probe', endpoint: $('#meEndpoint').value, key: $('#meKey').value })
      .catch(e => ({ ok: false, error: String(e) }));
    if (r && r.ok && r.list && r.list.length) {
      $('#meModel').value = r.list[0];
      $('#meMsg').textContent = '探测到 ' + r.list.length + ' 个模型，已填入首个';
    } else {
      $('#meMsg').textContent = '失败：' + ((r && r.error) || '无结果');
    }
  });
  $('#meTest').addEventListener('click', async () => {
    $('#meMsg').textContent = '测试中…';
    const model = {
      name: $('#meName').value, endpoint: $('#meEndpoint').value, model: $('#meModel').value,
      key: $('#meKey').value, maxTok: +$('#meMaxTok').value || 0
    };
    const r = await browser.runtime.sendMessage({ type: 'testModel', model }).catch(e => ({ ok: false, error: String(e) }));
    $('#meMsg').textContent = r && r.ok ? '成功：' + r.sample : '失败：' + (r && r.error);
  });
  $('#meSave').addEventListener('click', () => {
    const data = {
      id: editingModel >= 0 ? Cfg.models[editingModel].id : 'm-' + Date.now(),
      name: $('#meName').value.trim() || $('#meModel').value.trim() || '未命名',
      vendor: $('#meVendor').value.trim() || guessVendor($('#meEndpoint').value),
      endpoint: $('#meEndpoint').value.trim(),
      model: $('#meModel').value.trim(),
      key: $('#meKey').value,
      conc: +$('#meConc').value || 0,
      maxTok: +$('#meMaxTok').value || 0,
      enabled: true,
      fails: 0
    };
    if (editingModel >= 0) Cfg.models[editingModel] = Object.assign(Cfg.models[editingModel], data);
    else Cfg.models.push(data);
    save();
    $('#modelEdit').classList.add('hidden');
    editingModel = -1;
    renderModels(); renderEngines();
  });

  /* 调用控制 / 段落合并 */
  const num = (id, fn) => $(id).addEventListener('change', () => { fn(+$(id).value); save(); renderModels(); });
  num('#cfgConc', v => Cfg.concurrency = Math.max(1, v || 2));
  num('#cfgInterval', v => Cfg.callInterval = Math.max(0, v || 0));
  num('#cfgTimeout', v => Cfg.replyTimeout = Math.max(5, v || 90) * 1000);
  num('#cfgRetry', v => Cfg.retryCount = Math.max(0, v || 0));
  num('#cfgMaxSegs', v => Cfg.maxBatchSegs = Math.min(200, Math.max(1, v || 50)));
  num('#cfgMaxChars', v => Cfg.maxBatchChars = Math.min(50000, Math.max(200, v || 1000)));

  /* 提示词模板库：新建 / 保存 / 取消（全部行内，无 prompt()/confirm() 弹窗） */
  $('#promptNew').addEventListener('click', () => gotoPromptEditor('new'));
  $('#promptSave').addEventListener('click', savePromptEditor);
  $('#promptCancel').addEventListener('click', closePromptEditor);

  /* 设置页 */
  $('#peekDblSw').addEventListener('click', () => { Cfg.peekDbl = !Cfg.peekDbl; save(); renderSettings(); });
  $('#peekHoldSw').addEventListener('click', () => { Cfg.peekHold = !Cfg.peekHold; save(); renderSettings(); });
  $('#badgeSw').addEventListener('click', () => { Cfg.badgeEnabled = !(Cfg.badgeEnabled !== false); save(); renderSettings(); });
  $('#peekKey').addEventListener('change', () => { Cfg.peekKey = $('#peekKey').value; save(); });
  $('#peekHoldMs').addEventListener('change', () => { Cfg.peekHoldMs = Math.min(1500, Math.max(150, +$('#peekHoldMs').value || 400)); save(); });
  $$('#manualScopeRow button').forEach(b => b.addEventListener('click', () => {
    Cfg.manualScope = b.dataset.scope;
    save(); renderSettings();
  }));

  /* 翻译行为：点击后在列表插入与已有行同结构的空白草稿行（名称/站点/表达式/行为/模板/开关） */
  $('#xpAdd').addEventListener('click', () => {
    draftRule = {
      id: '', kind: 'regex', name: '', site: '*', expr: '',
      mode: 'skip', flags: '', enabled: true, builtin: false
    };
    $('#xpMsg').textContent = '';
    renderBehaviorRules();
    const row = $('#xpList .rule-row.draft');
    if (row) {
      row.scrollIntoView({ block: 'nearest' });
      const nm = row.querySelector('.r-name');
      if (nm) nm.focus({ preventScroll: true });
    }
  });

  $('#cacheClear').addEventListener('click', async () => {
    await browser.runtime.sendMessage({ type: 'clearCache' });
    refreshCacheInfo();
  });

  /* 配置 */
  $('#cfgExport').addEventListener('click', () => {
    const blob = new Blob([serializeConfig(Cfg)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'translite-config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });
  $('#cfgImport').addEventListener('click', () => $('#cfgFile').click());
  $('#cfgFile').addEventListener('change', async () => {
    const f = $('#cfgFile').files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      Cfg = parseConfig(txt); // 校验+迁移
      save(); renderAll();
    } catch (e) { alert('导入失败：配置文件格式不正确'); }
    $('#cfgFile').value = '';
  });
  $('#cfgReset').addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      $('#cfgReset').textContent = '确认重置？';
      setTimeout(() => { resetArmed = false; $('#cfgReset').textContent = '重置配置'; }, 3000);
      return;
    }
    resetArmed = false;
    $('#cfgReset').textContent = '重置配置';
    Cfg = parseConfig('');
    save(); renderAll();
  });
  $('#fxSyncSw').addEventListener('click', async () => {
    const on = !$('#fxSyncSw').classList.contains('on');
    await browser.runtime.sendMessage({ type: 'syncSet', on }).catch(() => {});
    $('#fxSyncSw').classList.toggle('on', on);
  });

  /* 底部主按钮 / 双语：总闸关闭时不响应翻译 */
  $('#mainBtn').addEventListener('click', async () => {
    if (activeTabId == null || Cfg.globalMode === 'off') return;
    browser.tabs.sendMessage(activeTabId, { cmd: 'primaryAction' }).catch(() => {});
    setTimeout(refreshStatus, 400);
  });
  $('#biSw').addEventListener('click', async () => {
    if (activeTabId == null || Cfg.globalMode === 'off') return;
    browser.tabs.sendMessage(activeTabId, { cmd: 'toggleBi' }).catch(() => {});
    setTimeout(refreshStatus, 300);
  });
}

function renderAll() {
  applyPanelSize();
  renderGlobal();
  renderEngines();
  renderLang();
  renderScope();
  renderAuto();
  renderModels();
  renderSettings();
  refreshStatus();
}

/* ================= 初始化 ================= */
(async () => {
  try {
    const o = await browser.storage.local.get('tl_config_v1');
    Cfg = parseConfig(o.tl_config_v1 || '');
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId = tabs[0] && tabs[0].id;
    currentHref = (tabs[0] && tabs[0].url) || '';
  } catch (e) { /* 保持默认 */ }
  renderAll();
  bindAll();
  bindTips();
  bindResize();
  setInterval(refreshStatus, 2000);
})();
