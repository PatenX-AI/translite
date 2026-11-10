/* ============ lib/core.js — 纯逻辑（background / content / node 单测共用） ============ */
/* 无 DOM、无 browser.* 依赖；配置解析与迁移、分段打包、免译规则、自动翻译判定、引擎协议工具 */

/* ---------- 基础工具 ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function debounce(fn, ms) {
  let t = 0;
  return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/* ---------- 字符统计 / 语言检测 ---------- */
function textWeight(s) {
  let w = 0;
  for (const ch of String(s)) {
    if (/[⺀-鿿/[⺀-鿿豈-﫿぀-ヿ가-힯]/.test(ch)) w += 1;
    else if (/\s/.test(ch)) w += 0;
    else w += 0.5;
  }
  return w;
}
function detectLang(s) {
  const t = String(s);
  let cjk = 0, kana = 0, hangul = 0, latin = 0, cyr = 0, total = 0;
  for (const ch of t) {
    if (/\s/.test(ch)) continue;
    total++;
    if (/[぀-ヿ]/.test(ch)) kana++;
    else if (/[가-힯]/.test(ch)) hangul++;
    else if (/[一-鿿]/.test(ch)) cjk++;
    else if (/[A-Za-z]/.test(ch)) latin++;
    else if (/[Ѐ-ӿ]/.test(ch)) cyr++;
  }
  if (!total) return 'other';
  if (kana / total > 0.1) return 'ja';
  if (hangul / total > 0.1) return 'ko';
  if (cjk / total > 0.2) return 'zh';
  if (cyr / total > 0.2) return 'ru';
  if (latin / total > 0.5) return latinLang(t);
  return 'other';
}
const LATIN_STOPWORDS = {
  en: ['the', 'and', 'is', 'of', 'to', 'in', 'that', 'it', 'for', 'as', 'with', 'was', 'on', 'be', 'at'],
  fr: ['le', 'la', 'les', 'de', 'des', 'et', 'est', 'une', 'un', 'que', 'dans', 'pour', 'avec', 'pas', 'sur'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'von', 'für', 'auf', 'sich', 'auch'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'por', 'con', 'para', 'es', 'no'],
  it: ['il', 'lo', 'la', 'di', 'che', 'e', 'un', 'una', 'per', 'con', 'non', 'sono', 'nel', 'gli'],
  pt: ['o', 'a', 'os', 'as', 'de', 'que', 'e', 'um', 'uma', 'para', 'com', 'não', 'dos', 'das', 'em']
};
function latinLang(t) {
  const words = String(t).toLowerCase().match(/[a-zà-ÿ]+/g) || [];
  if (!words.length) return 'en';
  let best = 'en', bestScore = 0;
  for (const code of Object.keys(LATIN_STOPWORDS)) {
    const set = LATIN_STOPWORDS[code];
    let score = 0;
    for (const w of words) if (set.indexOf(w) >= 0) score++;
    score = score / words.length;
    if (score > bestScore) { bestScore = score; best = code; }
  }
  return bestScore > 0.04 ? best : 'en';
}

const LANG_ALIASES = {
  zh: ['zh', 'cn', 'zh-cn', 'zh-hans', '中文', '简体中文', '繁體中文', '繁体中文', '汉语', 'chinese'],
  en: ['en', 'us', 'uk', '英文', '英语', 'english'],
  ja: ['ja', 'jp', '日文', '日语', 'japanese'],
  ko: ['ko', 'kr', '韩文', '韩语', '朝鲜语', 'korean'],
  fr: ['fr', '法文', '法语', 'french'],
  de: ['de', '德文', '德语', 'german', 'deutsch'],
  es: ['es', '西班牙语', 'spanish', 'español'],
  ru: ['ru', '俄文', '俄语', 'russian'],
  pt: ['pt', '葡萄牙语', 'portuguese'],
  it: ['it', '意大利语', 'italian'],
  th: ['th', '泰语', '泰文', 'thai'],
  vi: ['vi', '越南语', 'vietnamese'],
  ar: ['ar', '阿拉伯语', 'arabic']
};
const LANG_NAMES = {
  zh: '中文', en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语',
  es: '西班牙语', ru: '俄语', pt: '葡萄牙语', it: '意大利语', th: '泰语', vi: '越南语', ar: '阿拉伯语'
};
function langName(code) { return LANG_NAMES[code] || String(code || '').toUpperCase(); }
function parseLangInput(s) {
  const v = String(s || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!v) return null;
  for (const code of Object.keys(LANG_ALIASES)) {
    if (LANG_ALIASES[code].some(a => a.toLowerCase() === v)) return code;
  }
  return null;
}
const LANG_LABELS = {
  'auto': '自动检测', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
  'en': 'English', 'ja': '日本語', 'ko': '한국어',
  'fr': 'Français', 'de': 'Deutsch', 'es': 'Español', 'ru': 'Русский'
};
const LANG_BASE = { 'zh-Hans': 'zh', 'zh-Hant': 'zh', 'en': 'en', 'ja': 'ja', 'ko': 'ko', 'fr': 'fr', 'de': 'de', 'es': 'es', 'ru': 'ru' };
const BAIDU_LANG = { 'auto': 'auto', 'zh-Hans': 'zh', 'zh-Hant': 'cht', 'en': 'en', 'ja': 'jp', 'ko': 'kor', 'fr': 'fra', 'de': 'de', 'es': 'spa', 'ru': 'ru' };

/* ---------- 免译规则（内置恒开） ---------- */
function isPureSymbol(s) { return !/[\p{L}\p{N}]/u.test(String(s)); }
/* 规则 1：单段只含数字与符号（无任何字母/汉字/假名/谚文）→ 不翻译；混排照译 */
function isSkipText(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return true;
  return !/[\p{L}]/u.test(t);
}
/* 规则 2 判定：译文 normalize 后与原文一致 → 不渲染译文（缓存免译标记） */
function normText(s) {
  let t = String(s == null ? '' : s);
  try { t = t.normalize('NFKC'); } catch (e) { /* 老环境 */ }
  return t.replace(/\s+/g, ' ').trim();
}
function sameTranslation(orig, trans) {
  return normText(orig) === normText(trans);
}

/* ---------- FNV-1a 哈希 / MD5 ---------- */
function hashStr(s) {
  let h = 0x811c9dc5;
  const t = String(s);
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
function md5(input) {
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const bytes = new TextEncoder().encode(String(input));
  const n = bytes.length;
  const total = (((n + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[n] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, (n * 8) >>> 0, true);
  dv.setUint32(total - 4, Math.floor(n * 8 / 4294967296), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      const rot = (F << S[i]) | (F >>> (32 - S[i]));
      B = (B + rot) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const w2hex = (w) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, w, true);
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  };
  return w2hex(a0) + w2hex(b0) + w2hex(c0) + w2hex(d0);
}

/* ---------- 键位 ---------- */
const PEEK_KEYS = {
  CapsLock: 'CapsLock',
  ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl',
  AltLeft: '左 Alt', AltRight: '右 Alt',
  ShiftLeft: '左 Shift', ShiftRight: '右 Shift'
};
function peekKeyName(code) { return PEEK_KEYS[code] || 'CapsLock'; }
function eventCombo(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  const k = e.code || e.key;
  if (k && ['Control', 'Alt', 'Shift', 'Meta'].indexOf(k) < 0) parts.push(k);
  return parts.join('+');
}
function fmtCombo(combo) {
  return String(combo || '').split('+').map(p => {
    if (p === 'Control') return 'Ctrl';
    if (p === 'Meta') return 'Win';
    if (/^Key[A-Z]$/.test(p)) return p.slice(3);
    if (/^Digit[0-9]$/.test(p)) return p.slice(5);
    return p;
  }).join('+');
}

/* ---------- 站点规则 ---------- */
function matchSite(pattern, href) {
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    const path = (u.pathname || '/').toLowerCase();
    let p = String(pattern || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!p) return false;
    const slash = p.indexOf('/');
    let hp = slash >= 0 ? p.slice(0, slash) : p;
    const pp = slash >= 0 ? p.slice(slash) : null;
    if (!hp) return false;
    let hostOk;
    if (hp === '*') hostOk = true;
    else if (hp.startsWith('*.')) hostOk = host.endsWith(hp.slice(1));
    else hostOk = host === hp || host.endsWith('.' + hp);
    if (!hostOk) return false;
    if (pp == null) return true;
    const re = new RegExp('^' + pp.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return re.test(path) || re.test(path.replace(/\/$/, '') || '/');
  } catch (e) {
    return false;
  }
}
/* v1.4：站点规则支持多个网站，用 , 或 ;（含全角）分隔；含 '*' 视为全局 */
function splitSites(s) {
  return String(s || '').split(/[,;，；]/).map(x => String(x).trim()).filter(Boolean);
}
function isGlobalSite(s) {
  const parts = splitSites(s);
  return !parts.length || parts.indexOf('*') >= 0;
}
function matchSiteList(sites, href) {
  return splitSites(sites).some(p => p === '*' || matchSite(p, href));
}
/* 站点具体度：不含通配符的更具体；用于多条站点提示词命中时排序 */
function siteSpecificity(sites) {
  let best = -1;
  for (const p of splitSites(sites)) {
    const v = p === '*' ? 0 : (p.indexOf('*') >= 0 ? 1 : 2 + p.length / 1000);
    if (v > best) best = v;
  }
  return best;
}

/* ---------- 提示词 ---------- */
const PROMPT_PRESETS = [
  {
    id: 'general', name: '通用翻译',
    text: '你是专业翻译引擎。忠实翻译，保持原文语气与语域；保留占位符、代码片段、数字、单位、专有名词（品牌/产品名）与标点风格；不增译、不漏译、不解释；译文自然流畅。'
  },
  {
    id: 'tech', name: '科技文献翻译大师',
    text: '你是科技文献翻译大师，擅长论文、技术报告与学术专著的翻译。要求：\n1. 术语准确、全文一致，采用学科领域通行译法；首次出现的关键术语可在括号中保留原文。\n2. 公式、变量、单位、图表编号、参考文献引用（如 [1]、Fig. 3）保持原样不译。\n3. 译文书面、严谨、客观，符合科技文体：长定语合理拆分，避免口语化。\n4. 不意译专业概念，不添加解释性内容或译注。'
  },
  {
    id: 'patent', name: '专利翻译大师',
    text: '你是专利翻译大师，精通中国专利法与专利文书规范。要求：\n1. 采用中国专利文献标准译法：comprising 译为"包括"、characterized in that 译为"其特征在于"、所述对应 the/said，权利要求套话符合中文专利表述习惯。\n2. 权利要求编号、附图标记（如 Fig. 1、标号 102）、引用关系（如"如权利要求 1 所述"）准确无误、不译错不丢失。\n3. 技术术语全文一致，采用专利审查中的规范表述，部件名称不得随意替换或口语化。\n4. 译文严谨、无歧义，不得增减技术特征或改变保护范围。\n5. 申请号、公开号、IPC 分类号等编号保持原样。'
  }
];
/* v1.4 单一模板库：内置 3 条在 parseConfig 时实体化进 Cfg.prompts（builtin:true）。
 * 这样内置模板也能编辑名称/正文/站点（尤其是「适配站点规则」），且不再有两套来源。 */
function builtinPrompts() {
  return PROMPT_PRESETS.map(p => ({
    id: p.id, name: p.name, text: p.text, site: '', builtin: true, enabled: true
  }));
}
function allPrompts(cfg) {
  return (cfg && cfg.prompts) || builtinPrompts();
}
/* 按站点自动套用：站点串可含多个网站（, 或 ; 分隔）；多条命中时更具体的站点优先。
 * 无命中则回退全局 promptPreset。仅影响大模型引擎的系统提示词。 */
function promptForSite(cfg, href) {
  if (!href) return null;
  const hit = allPrompts(cfg).filter(p =>
    p && p.enabled !== false && String(p.site || '').trim() && matchSiteList(p.site, href));
  if (!hit.length) return null;
  hit.sort((a, b) => siteSpecificity(b.site) - siteSpecificity(a.site));
  return hit[0];
}
function activePromptId(cfg, href) {
  const bySite = promptForSite(cfg, href);
  return bySite ? bySite.id : ((cfg && cfg.promptPreset) || 'general');
}
function activePromptText(cfg, href) {
  const id = activePromptId(cfg, href);
  const p = allPrompts(cfg).find(x => x.id === id);
  return (p && p.text) || PROMPT_PRESETS[0].text;
}

/* ---------- 配置：默认值 / 迁移 / 归一化 ---------- */
const PROVIDERS = [
  { id: 'glm', name: 'GLM·智谱', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'GLM-4-Flash-250414', apply: 'https://open.bigmodel.cn/', applyText: '申请 Key' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-flash', apply: 'https://platform.deepseek.com/', applyText: '申请 Key' },
  { id: 'mimo', name: 'MiMo·小米', endpoint: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.6-flash', apply: 'https://platform.xiaomimimo.com/', applyText: '申请 Key' },
  { id: 'bailian', name: '百炼·阿里', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-flash', apply: 'https://bailian.console.aliyun.com/', applyText: '申请 Key' },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-5.6-luna', apply: 'https://platform.openai.com/', applyText: '申请 Key' },
  { id: 'gemini', name: 'Gemini·Google', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-3.8-flash', apply: 'https://aistudio.google.com/apikey', applyText: '申请 Key' },
  { id: 'ollama', name: 'Ollama·本地', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'qwen3:8b', apply: '', applyText: '' },
  { id: 'custom', name: '自定义', endpoint: '', model: '', apply: '', applyText: '' }
];
function defaultModels() {
  return [
    { id: 'm-glm', name: 'GLM-4-Flash-250414', vendor: 'GLM·智谱', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'GLM-4-Flash-250414', key: '', conc: 0, maxTok: 0, enabled: true, fails: 0 },
    { id: 'm-mimo', name: 'MiMo V2.6', vendor: 'MiMo·小米', endpoint: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.6-flash', key: '', conc: 0, maxTok: 0, enabled: true, fails: 0 },
    { id: 'm-ds', name: 'DeepSeek V4.1 Flash', vendor: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-flash', key: '', conc: 0, maxTok: 0, enabled: true, fails: 0 }
  ];
}
/* 服务商名称：优先模型自带 vendor，其次按接口域名匹配预置服务商 */
function guessVendor(endpoint) {
  const e = String(endpoint || '');
  if (!e) return '自定义';
  for (const p of PROVIDERS) {
    if (!p.endpoint) continue;
    const host = p.endpoint.replace(/^https?:\/\//, '').split('/')[0];
    if (host && e.indexOf(host) >= 0) return p.name;
  }
  return '自定义';
}
/* v1.4 内置「翻译行为」规则：
 * - 每条规则都有 name；表达式为「完整段落匹配」主体（由 compileSkipRule 统一包 ^(?:…)$），
 *   因此段内同时含正常语句与匹配内容（如 sen a email to lily@gmail.com）不会命中。
 * - 正则类 mode 也可设 inline/trans（对命中段落打标），不限于 skip。
 * - 站点默认 '*' 全局、支持 , 或 ; 分隔多站点；用户可禁用/删除，删除后不复活。
 * - 注：用户给出的 normalize-space(@//class/) 不是合法 XPath，此处按标准 class token 匹配写为 @class。 */
const BUILTIN_BEHAVIOR_RULES = [
  {
    id: 'b-alnum', kind: 'regex', site: '*', builtin: true, flags: '', mode: 'skip', enabled: true,
    name: '字母数字混编编号',
    expr: '(?=[A-Za-z0-9._:/-]*[A-Za-z])(?=[A-Za-z0-9._:/-]*\\d)[A-Za-z0-9._:/-]+'
  },
  {
    id: 'b-email', kind: 'regex', site: '*', builtin: true, flags: '', mode: 'skip', enabled: true,
    name: '邮件地址',
    expr: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+'
  },
  {
    id: 'b-url', kind: 'regex', site: '*', builtin: true, flags: 'i', mode: 'skip', enabled: true,
    name: '网址',
    expr: '(?:https?://|www\\.)[^\\s]+'
  },
  {
    id: 'b-zhihuiya', kind: 'xpath', site: '*.zhihuiya.com', builtin: true, mode: 'inline', enabled: true,
    name: '智慧芽专利标题',
    expr: '//p[contains(concat(" ", normalize-space(@class), " "), " patent-app__title-context ")]'
  }
];

const DEFAULT_LANG_LIST = ['zh', 'en', 'ja', 'ko', 'fr']; // 一行：中文（默认不选）+ 最常用 4 种（默认选中）
const DEFAULTS = {
  engine: 'microsoft',
  mode: 'target',
  biPref: false,
  srcLang: 'auto',
  tgtLang: 'zh-Hans',
  scope: 'lazy',
  maxBatchSegs: 50,
  maxBatchChars: 1000,
  lazyAhead: 1,
  concurrency: 2,
  callInterval: 0,
  replyTimeout: 90000,
  retryCount: 3,
  inlineThreshold: 30,
  minLength: 2,
  shortcuts: { toggle: 'Alt+KeyA', cycle: 'Alt+Shift+KeyA' },
  peekDbl: true,
  peekHold: true,
  peekKey: 'CapsLock',
  peekHoldMs: 400,
  /* v1.1 配置结构 */
  globalMode: 'on',            // on | off（总闸：off 时零注入、不响应翻译）
  autoAll: true,               // 自动翻译开关①：全部站点（原始语言匹配时）
  autoSiteOn: true,            // 自动翻译开关②：自定义站点规则（两者全关=禁用自动翻译，不影响按钮/快捷键）
  autoRule: 'all',             // 兼容镜像（由 autoAll/autoSiteOn 派生，旧 UI 读取；不再作为判定依据）
  sourceLang: ['en', 'ja', 'ko', 'fr'],        // 已启用的原始语言（中文默认不选）
  sourceLangList: DEFAULT_LANG_LIST.slice(),  // 界面显示的语言 chip 列表
  quickModel: '',              // 翻译页首选模型 id，空=初始不选中任何模型
  badgeEnabled: true,          // 工具栏状态角标
  popupW: 0, popupH: 0,        // 弹出面板尺寸（0=默认）
  /* 兼容保留（迁移来源） */
  autoEnabled: true,
  autoSites: [],
  autoLangEnabled: true,
  autoLangs: ['en', 'ja', 'ko', 'fr', 'de', 'ru'],
  /* v1.3：统一「翻译行为」规则（XPath / 正则共用站点与行为字段） */
  behaviorRules: BUILTIN_BEHAVIOR_RULES.map(r => Object.assign({}, r)),
  behaviorBuiltinApplied: true, // 内置规则已处理标记（老配置升级补入一次，删除后不复活）
  /* v1.4：单一提示词模板库，内置 3 条实体化持久化（可编辑站点/正文，不可删除） */
  promptPreset: 'general',     // 键名保留（Firefox Sync 兼容），值为 allPrompts() 中的 id
  prompts: builtinPrompts(),   // [{ id, name, text, site?, builtin?, enabled? }]，site 可用 , 或 ; 分隔多站点
  promptsBuiltinApplied: true, // 内置模板已补入标记（老配置升级补一次）
  promptsMigrated: true,        // 旧 promptCustom / promptTemplates 已迁移标记
  manualScope: 'page',          // 手动点击/快捷键的作用范围：page=当前页 | domain=当前域名
  baidu: { appid: '', secret: '', endpoint: 'https://fanyi-api.baidu.com/api/trans/vip/translate' },
  models: defaultModels(),
  cacheMax: 3000
};

function parseConfig(raw) {
  const Cfg = Object.assign({}, DEFAULTS, {
    baidu: Object.assign({}, DEFAULTS.baidu),
    models: defaultModels(),
    autoSites: [],
    behaviorRules: BUILTIN_BEHAVIOR_RULES.map(r => Object.assign({}, r)),
    prompts: builtinPrompts(),
    shortcuts: Object.assign({}, DEFAULTS.shortcuts),
    sourceLang: DEFAULTS.sourceLang.slice(),
    sourceLangList: DEFAULT_LANG_LIST.slice()
  });
  if (raw) {
    try {
      const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
      /* ---- v1.3 迁移①：旧 xpathRules（含 scope/pattern）→ 统一 behaviorRules ---- */
      if (!Array.isArray(saved.behaviorRules)) {
        saved.behaviorRules = (Array.isArray(saved.xpathRules) ? saved.xpathRules : []).map((x, i) => {
          let site = String((x && x.site) || '').trim();
          if (!site) site = (x && x.scope === 'site' && String(x.pattern || '').trim())
            ? String(x.pattern).trim() : '*';
          return {
            id: 'r' + i, kind: 'xpath', site,
            expr: String((x && x.xpath) || ''),
            mode: (x && (x.mode === 'inline' || x.mode === 'trans')) ? x.mode : 'skip',
            enabled: !x || x.enabled !== false, builtin: false, flags: '', name: ''
          };
        }).filter(r => r.expr);
      }
      /* 内置规则只在首次升级时补入（按 expr 去重）；用户删除后不复活 */
      if (saved.behaviorBuiltinApplied !== true) {
        for (const br of BUILTIN_BEHAVIOR_RULES) {
          if (!saved.behaviorRules.some(r => r.expr === br.expr)) {
            saved.behaviorRules.unshift(Object.assign({}, br));
          }
        }
      }
      /* ---- v1.3 迁移②：旧 promptCustom / promptTemplates / promptPreset → prompts ---- */
      if (!Array.isArray(saved.prompts)) {
        const list = (Array.isArray(saved.promptTemplates) ? saved.promptTemplates : []).map((t, i) => ({
          id: String((t && t.id) || ('u' + i)), name: String((t && t.name) || ('模板' + (i + 1))),
          text: String((t && t.text) || ''), site: '', enabled: true
        }));
        let customId = '';
        if (String(saved.promptCustom || '').trim()) {
          customId = 'u-custom';
          list.push({
            id: customId, name: String(saved.promptCustomName || '自定义').trim() || '自定义',
            text: String(saved.promptCustom), site: '', enabled: true
          });
        }
        saved.prompts = list;
        let p = String(saved.promptPreset || 'general');
        if (p === 'custom') p = customId || 'general';
        else if (p.startsWith('tpl:')) p = p.slice(4);
        saved.promptPreset = p;
      }
      /* ---- v1.4 迁移③：内置 3 条实体化进 prompts（首次升级补入，按 id 去重） ----
       * 老版本中内置模板由 allPrompts() 运行时注入、不可编辑；升级后变成可编辑的持久化记录。 */
      if (saved.promptsBuiltinApplied !== true && Array.isArray(saved.prompts)) {
        const missing = builtinPrompts().filter(b => !saved.prompts.some(p => p && p.id === b.id));
        saved.prompts = missing.concat(saved.prompts);
      }
      if (saved.minLength === undefined && saved.minWeight !== undefined) saved.minLength = saved.minWeight;
      if (saved.maxBatchChars === undefined && saved.mergeCount !== undefined) {
        saved.maxBatchChars = clamp(Math.round((saved.mergeCount || 8) * 500), 500, 50000);
      }
      if (saved.peekDbl === undefined && saved.peekHold === undefined && saved.peekTrigger !== undefined) {
        saved.peekHold = saved.peekTrigger === 'hold';
        saved.peekDbl = saved.peekTrigger !== 'hold';
      }
      if (saved.peekKey !== undefined && !PEEK_KEYS[saved.peekKey]) {
        saved.peekKey = { Control: 'ControlLeft', Alt: 'AltLeft', Shift: 'ShiftLeft', Meta: 'CapsLock' }[saved.peekKey] || 'CapsLock';
      }
      if (saved.scope === 'segment') saved.scope = 'full';
      /* 旧自动翻译配置 → 全局开关 / 两个独立自动开关 / 原始语言
       * 仅当旧字段确实存在时才按旧值判定；字段全缺失 → 保持新默认 on（避免误判为关闭） */
      if (saved.globalMode === undefined &&
          (saved.autoLangEnabled !== undefined || saved.autoEnabled !== undefined)) {
        if (saved.autoLangEnabled) { saved.globalMode = 'on'; saved.autoRule = 'all'; }
        else if (saved.autoEnabled) { saved.globalMode = 'on'; saved.autoRule = 'sites'; }
        else saved.globalMode = 'off';
      }
      if (saved.sourceLang === undefined && Array.isArray(saved.autoLangs)) saved.sourceLang = saved.autoLangs;
      if (saved.sourceLangList === undefined) {
        /* 旧版没有 chip 列表：中文 + 已启用语言（去重， preserving 顺序） */
        const seen = new Set(['zh']);
        const list = ['zh'];
        for (const l of (Array.isArray(saved.sourceLang) ? saved.sourceLang : DEFAULTS.sourceLang)) {
          if (!seen.has(l)) { seen.add(l); list.push(l); }
        }
        saved.sourceLangList = list;
      }
      if (saved.autoAll === undefined && saved.autoSiteOn === undefined) {
        const legacy = saved.autoRule === 'sites' ? 'sites' : 'all';
        saved.autoAll = legacy !== 'sites';
        saved.autoSiteOn = legacy === 'sites';
      }
      /* 模型补 vendor（旧配置没有服务商名称） */
      if (Array.isArray(saved.models)) {
        saved.models = saved.models.map(m => Object.assign({}, m, {
          vendor: String((m && m.vendor) || guessVendor(m && m.endpoint) || '自定义')
        }));
      }
      for (const k of Object.keys(DEFAULTS)) {
        if (saved[k] === undefined) continue;
        if (k === 'baidu') Object.assign(Cfg.baidu, saved.baidu || {});
        else if (k === 'models') Cfg.models = Array.isArray(saved.models) ? saved.models : defaultModels();
        else if (k === 'shortcuts') Cfg.shortcuts = Object.assign({}, DEFAULTS.shortcuts, saved.shortcuts || {});
        else if (k === 'autoSites') {
          Cfg.autoSites = (Array.isArray(saved.autoSites) ? saved.autoSites : []).map(x =>
            typeof x === 'string' ? { pattern: x, enabled: true } : { pattern: x.pattern || '', enabled: x.enabled !== false }
          ).filter(x => x.pattern);
        }
        else if (k === 'autoLangs') Cfg.autoLangs = Array.isArray(saved.autoLangs) ? saved.autoLangs : DEFAULTS.autoLangs.slice();
        else if (k === 'sourceLang') Cfg.sourceLang = Array.isArray(saved.sourceLang) ? saved.sourceLang.slice() : DEFAULTS.sourceLang.slice();
        else if (k === 'sourceLangList') Cfg.sourceLangList = Array.isArray(saved.sourceLangList) ? saved.sourceLangList.slice() : DEFAULT_LANG_LIST.slice();
        else if (k === 'behaviorRules') {
          Cfg.behaviorRules = (Array.isArray(saved.behaviorRules) ? saved.behaviorRules : []).map((r, i) => {
            const kind = r && r.kind === 'regex' ? 'regex' : 'xpath';
            return {
              id: String((r && r.id) || ('r' + i)),
              kind,
              site: String((r && r.site) || '').trim() || '*',
              expr: String((r && r.expr) || ''),
              /* v1.4：正则类也可设 inline/trans（对命中段落打标），不再锁 skip */
              mode: (r && (r.mode === 'inline' || r.mode === 'trans')) ? r.mode : 'skip',
              enabled: !r || r.enabled !== false,
              builtin: !!(r && r.builtin),
              /* 禁 g/y：避免 lastIndex 造成跨段误判；仅允许 i/m/s/u */
              flags: kind === 'regex' ? String((r && r.flags) || '').replace(/[^imsu]/g, '').slice(0, 4) : '',
              name: String((r && r.name) || '').trim() || ('规则 ' + (i + 1))
            };
          }).filter(r => r.expr);
        }
        else if (k === 'prompts') {
          Cfg.prompts = (Array.isArray(saved.prompts) ? saved.prompts : []).map((p, i) => ({
            id: String((p && p.id) || ('u' + i)),
            name: String((p && p.name) || ('模板' + (i + 1))).slice(0, 40),
            text: String((p && p.text) || ''),
            site: String((p && p.site) || '').trim(),
            builtin: !!(p && p.builtin),
            enabled: !p || p.enabled !== false
          })).filter(p => p.text);
        }
        else Cfg[k] = saved[k];
      }
    } catch (e) { /* 配置损坏则用默认 */ }
  }
  Cfg.maxBatchSegs = clamp(+Cfg.maxBatchSegs || 50, 1, 200);
  Cfg.lazyAhead = clamp(+Cfg.lazyAhead || 0, 0, 10);
  if (Cfg.scope !== 'lazy' && Cfg.scope !== 'full') Cfg.scope = 'lazy';
  if (Cfg.peekDbl !== false) Cfg.peekDbl = true;
  if (Cfg.peekHold !== false) Cfg.peekHold = true;
  if (!PEEK_KEYS[Cfg.peekKey]) Cfg.peekKey = 'CapsLock';
  if (Cfg.globalMode !== 'off') Cfg.globalMode = 'on';
  Cfg.autoAll = Cfg.autoAll !== false;
  Cfg.autoSiteOn = Cfg.autoSiteOn !== false;
  /* 兼容镜像：旧 UI/外部读取 autoRule 时仍能拿到合理值 */
  Cfg.autoRule = (!Cfg.autoAll && Cfg.autoSiteOn) ? 'sites' : 'all';
  if (!Array.isArray(Cfg.sourceLang)) Cfg.sourceLang = DEFAULTS.sourceLang.slice();
  if (!Array.isArray(Cfg.sourceLangList) || !Cfg.sourceLangList.length) Cfg.sourceLangList = DEFAULT_LANG_LIST.slice();
  Cfg.quickModel = String(Cfg.quickModel || '');
  Cfg.badgeEnabled = Cfg.badgeEnabled !== false;
  Cfg.popupW = clamp(+Cfg.popupW || 0, 0, 1200);
  Cfg.popupH = clamp(+Cfg.popupH || 0, 0, 1200);
  Cfg.behaviorBuiltinApplied = true; // 随配置持久化，确保内置规则只补入一次
  Cfg.promptsMigrated = true;
  Cfg.promptsBuiltinApplied = true;
  if (Cfg.manualScope !== 'domain') Cfg.manualScope = 'page';
  if (!Array.isArray(Cfg.prompts) || !Cfg.prompts.length) Cfg.prompts = builtinPrompts();
  if (!Array.isArray(Cfg.behaviorRules)) Cfg.behaviorRules = BUILTIN_BEHAVIOR_RULES.map(r => Object.assign({}, r));
  if (!allPrompts(Cfg).some(p => p.id === Cfg.promptPreset)) Cfg.promptPreset = 'general';
  return Cfg;
}
function serializeConfig(Cfg) {
  const data = {};
  for (const k of Object.keys(DEFAULTS)) data[k] = Cfg[k];
  return JSON.stringify(data);
}

/* ---------- 自动翻译判定（globalMode + 两个独立开关） ---------- */
/* 两个开关分别控制：全部站点（语言匹配）/ 自定义站点规则；可同开、可同关。
 * 全关 = 禁用自动翻译，但不影响主按钮与快捷键（由 content/background 单独判定）。 */
function shouldAutoTranslate(cfg, href, pageLang) {
  if (!cfg || cfg.globalMode !== 'on') return false;
  const legacy = cfg.autoAll === undefined && cfg.autoSiteOn === undefined;
  const allOn = legacy ? cfg.autoRule !== 'sites' : cfg.autoAll !== false;
  const siteOn = legacy ? cfg.autoRule === 'sites' : cfg.autoSiteOn !== false;
  if (allOn && (cfg.sourceLang || []).indexOf(pageLang) >= 0) return true;
  if (siteOn && (cfg.autoSites || []).some(r => r.enabled !== false && matchSite(r.pattern, href))) return true;
  return false;
}
/* 规则站点：v1.3 统一 site；旧版 scope/pattern 结构兜底；'*' 表示全局 */
function xpathRuleSite(r) {
  const site = String((r && r.site) || '').trim();
  if (site) return site;
  if (r && r.scope === 'site' && String(r.pattern || '').trim()) return String(r.pattern).trim();
  return '*';
}
const ruleSite = xpathRuleSite;
/* 当前页面生效的翻译行为规则：站点支持多值（, 或 ;）；全局排前、站点排后（站点专属可覆盖）。 */
function activeBehaviorRules(cfg, href) {
  const hit = ((cfg && cfg.behaviorRules) || []).filter(r =>
    r && r.enabled !== false && r.expr && matchSiteList(ruleSite(r), href));
  return hit.slice().sort((a, b) => (isGlobalSite(ruleSite(a)) ? 0 : 1) - (isGlobalSite(ruleSite(b)) ? 0 : 1));
}
/* XPath 类 → DOM 打标（content.applyXPathMarks 消费）；补 xpath 字段兼容旧调用 */
function activeXPathRules(cfg, href) {
  return activeBehaviorRules(cfg, href).filter(r => r.kind !== 'regex')
    .map(r => Object.assign({}, r, { xpath: r.expr }));
}
/* v1.4：正则类保留原 mode（skip / inline / trans），由 content 分两条链路消费 */
function activeRegexRules(cfg, href) {
  return activeBehaviorRules(cfg, href).filter(r => r.kind === 'regex');
}
/* ---------- 正则跳过规则（完整段落匹配） ----------
 * 统一包 ^(?:…)$：只有整段完全匹配才跳过；段内同时含正常语句与匹配内容不跳过。
 * 编译结果按 expr+flags 缓存；非法/超长表达式返回 null（视为不生效）。
 * 用户自定义规则仅对 ≤256 字符段执行，降低灾难性回溯风险。 */
const SKIP_RULE_CACHE = new Map();
function compileSkipRule(r) {
  const expr = String((r && r.expr) || '');
  const flags = String((r && r.flags) || '').replace(/[^imsu]/g, '').slice(0, 4);
  const key = expr + '\u0000' + flags;
  if (SKIP_RULE_CACHE.has(key)) return SKIP_RULE_CACHE.get(key);
  let re = null;
  if (expr && expr.length <= 200) {
    try { re = new RegExp('^(?:' + expr + ')$', flags); } catch (e) { re = null; }
  }
  if (SKIP_RULE_CACHE.size > 200) SKIP_RULE_CACHE.clear();
  SKIP_RULE_CACHE.set(key, re);
  return re;
}
function shouldSkipByRules(text, rules) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 512) return false;
  for (const r of rules || []) {
    if (!r || r.enabled === false) continue;
    /* 未指定 mode 的旧数据视为 skip；v1.4 起 inline/trans 由 regexMarkFor 打标 */
    if ((r.mode || 'skip') !== 'skip') continue;
    if (!r.builtin && t.length > 256) continue;
    const re = compileSkipRule(r);
    if (re && re.test(t)) return true;
  }
  return false;
}
/* v1.4：整段命中的非 skip 正则规则 → 返回应打的行为（inline / trans）。
 * 规则已按「全局在前、站点在后」排序，故站点规则后命中可覆盖全局规则。 */
function regexMarkFor(text, rules) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 512) return null;
  let mark = null;
  for (const r of rules || []) {
    if (!r || r.enabled === false) continue;
    const mode = r.mode || 'skip';
    if (mode !== 'inline' && mode !== 'trans') continue;
    if (!r.builtin && t.length > 256) continue;
    const re = compileSkipRule(r);
    if (re && re.test(t)) mark = mode;
  }
  return mark;
}

/* ---------- 超长段切分 / 打包 / 大段直发 ---------- */
function splitLong(text, maxLen) {
  const t = String(text || '');
  const max = maxLen || 1000;
  if (t.length <= max) return [t];
  const segs = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    let cutAt = -1;
    if (c === '。' || c === '！' || c === '？' || c === '；' || c === ';' || c === '\n') {
      cutAt = i + 1;
    } else if (c === '.' || c === '!' || c === '?') {
      let j = i + 1;
      while (j < t.length && t[j] === ' ') j++;
      const next = t[j];
      if (next === undefined || (next >= 'A' && next <= 'Z') || next === '[') cutAt = i + 1;
    } else if (c === '[' && (i === 0 || /\s/.test(t[i - 1])) && /^\[\d{4}\]/.test(t.slice(i, i + 6))) {
      cutAt = i;
    }
    if (cutAt >= 0) {
      const piece = t.slice(start, cutAt);
      if (piece) segs.push(piece);
      start = cutAt;
    }
  }
  if (start < t.length) segs.push(t.slice(start));
  const parts = [];
  let buf = '';
  for (const s of segs) {
    if (buf && buf.length + s.length > max) { parts.push(buf); buf = ''; }
    if (s.length > max) {
      if (buf) { parts.push(buf); buf = ''; }
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(' ', max);
        if (cut < max * 0.5) cut = max;
        parts.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      buf = rest;
    } else {
      buf += s;
    }
  }
  if (buf) parts.push(buf);
  return parts.filter(p => p.length);
}
function joinParts(parts, tgtLang) {
  const base = LANG_BASE[tgtLang] || 'zh';
  return parts.join(base === 'zh' || base === 'ja' || base === 'ko' ? '' : ' ');
}
function packBatches(units, maxChars, maxItems) {
  const out = [];
  let cur = [], curLen = 0;
  for (const u of units) {
    const len = String(u.text || '').length;
    if (cur.length && (curLen + len > maxChars || cur.length >= (maxItems || Infinity))) {
      out.push(cur); cur = []; curLen = 0;
    }
    cur.push(u); curLen += len;
  }
  if (cur.length) out.push(cur);
  return out;
}
/* token 估算（保守）：CJK≈1，拉丁≈0.25 */
function estTokens(text) {
  let n = 0;
  for (const ch of String(text)) {
    if (/[⺀-鿿豈-﫿぀-ヿ가-힯]/.test(ch)) n += 1;
    else if (!/\s/.test(ch)) n += 0.25;
  }
  return Math.ceil(n);
}
/* maxTok（k tokens）留空按 32K 估算预算 */
function tokenBudget(maxTokK) {
  return (maxTokK && maxTokK > 0) ? Math.round(maxTokK * 1024) : 32768;
}
/**
 * 大段直发判定（4.4）：单段超 maxChars 时——未超 Max Tokens 预算则整段直发（等待延长），
 * 超限才按句切分。返回 { parts, direct, timeoutMs }。
 * budget 判定：输入估算 + 输出预留（≈输入×1.1）≤ 预算。
 */
function planPieces(text, maxChars, maxTokK, baseTimeoutMs) {
  const t = String(text || '');
  const max = maxChars || 1000;
  const base = baseTimeoutMs || 90000;
  if (t.length <= max) return { parts: [t], direct: false, timeoutMs: base };
  const est = estTokens(t);
  const budget = tokenBudget(maxTokK);
  if (est + Math.round(est * 1.1) <= budget) {
    const timeoutMs = Math.min(base + Math.round(est / 2000) * 30000, 300000);
    return { parts: [t], direct: true, timeoutMs };
  }
  return { parts: splitLong(t, max), direct: false, timeoutMs: base };
}

/* ---------- 模型接力准入（启用 且 已配置） ---------- */
/* 已配置 = 有接口+模型名，且（密钥非空 或 本地免密钥端点）。
 * 初始预置模型 Key 为空 → 不参与接力、快捷选择不默认选中，等用户配置后才可用。 */
function modelConfigured(m) {
  if (!m) return false;
  const ep = String(m.endpoint || '').trim(), md = String(m.model || '').trim();
  if (!ep || !md) return false;
  if (String(m.key || '').trim()) return true;
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(ep) || /:11434(\/|$)/.test(ep);
}
function relayModels(models, quickId) {
  const list = (models || []).filter(m => m && m.enabled !== false && modelConfigured(m));
  const q = String(quickId || '').trim();
  if (!q) return list;
  const i = list.findIndex(m => m.id === q);
  if (i > 0) { const [m] = list.splice(i, 1); list.unshift(m); }
  return list;
}
function llmSystemPrompt(from, to, cfg, href) {
  const srcName = from === 'auto' ? 'the source language' : (LANG_LABELS[from] || from);
  const tgtName = LANG_LABELS[to] || to;
  const domain = activePromptText(cfg, href);
  return [
    domain ? domain + '\n' : '',
    'You are a professional translation engine.',
    /* 一批内可能混排多种源语言：不拆批，要求模型逐条独立判定源语言 */
    from === 'auto'
      ? 'The INPUT is a JSON array of strings. Each element may be written in a DIFFERENT source language; detect the language of each element independently and translate every element into ' + tgtName + '. Do not assume all elements share one language.'
      : 'Translate every string in the INPUT JSON array from ' + srcName + ' to ' + tgtName + '.',
    'Rules:',
    '1. Output ONLY a valid JSON array of translated strings. No explanations, no markdown fences.',
    '2. The output array MUST have exactly the same length and order as the input array.',
    '3. Preserve placeholders, code fragments, numbers, units, proper nouns (brand/product names) and punctuation style.',
    '4. Keep the tone and register of the original. Do not add or omit content.',
    '5. The domain guidance above applies to wording and terminology only; rules 1-2 (output format) always take precedence.'
  ].join('\n');
}
function parseLLMReply(content) {
  let s = String(content || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) throw new Error('大模型返回无法解析为 JSON 数组');
  const arr = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(arr)) throw new Error('大模型返回不是数组');
  return arr.map(x => (typeof x === 'string' ? x : (x && x.text) || JSON.stringify(x)));
}
function runPool(jobs, limit, worker) {
  return new Promise((resolve) => {
    const results = new Array(jobs.length);
    if (!jobs.length) return resolve(results);
    let idx = 0, done = 0;
    const lanes = Math.max(1, Math.min(limit, jobs.length));
    function next() {
      if (idx >= jobs.length) {
        if (done >= jobs.length) resolve(results);
        return;
      }
      const i = idx++;
      Promise.resolve()
        .then(() => worker(jobs[i], i))
        .then(r => { results[i] = r; }, e => { results[i] = { error: e }; })
        .then(() => { done++; next(); });
    }
    for (let k = 0; k < lanes; k++) next();
  });
}

/* node 单测导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    esc, debounce, sleep, clamp, textWeight, detectLang, latinLang,
    LANG_ALIASES, LANG_NAMES, langName, parseLangInput, LANG_LABELS, LANG_BASE, BAIDU_LANG,
    isPureSymbol, isSkipText, normText, sameTranslation, hashStr, md5,
    PEEK_KEYS, peekKeyName, eventCombo, fmtCombo, matchSite,
    splitSites, isGlobalSite, matchSiteList, siteSpecificity, builtinPrompts,
    PROMPT_PRESETS, allPrompts, promptForSite, activePromptId, activePromptText,
    PROVIDERS, defaultModels, guessVendor, DEFAULTS, BUILTIN_BEHAVIOR_RULES,
    parseConfig, serializeConfig, shouldAutoTranslate, xpathRuleSite, ruleSite,
    activeBehaviorRules, activeXPathRules, activeRegexRules, compileSkipRule, shouldSkipByRules, regexMarkFor,
    splitLong, joinParts, packBatches, estTokens, tokenBudget, planPieces,
    modelConfigured, relayModels, llmSystemPrompt, parseLLMReply, runPool
  };
}
