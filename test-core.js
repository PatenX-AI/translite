/* test-core.js — Firefox 原生版核心逻辑单测（node 直接跑） */
const assert = require('assert');
const c = require('./extension/lib/core.js');
const { tlSyncPack, tlSyncUnpack, TL_SYNC_CHUNK_BYTES } = require('./extension/lib/sync-chunks.js');

/* ---- 1. 免译规则：纯数字/符号段不翻译，混排照译 ---- */
assert.strictEqual(c.isSkipText('2024'), true, '纯数字');
assert.strictEqual(c.isSkipText('202410123456.7'), true, '数字+分隔符');
assert.strictEqual(c.isSkipText('1,234.5'), true);
assert.strictEqual(c.isSkipText('——'), true, '纯符号');
assert.strictEqual(c.isSkipText('※'), true);
assert.strictEqual(c.isSkipText(''), true, '空串');
assert.strictEqual(c.isSkipText('1234 次实验'), false, '数字+汉字混排照译');
assert.strictEqual(c.isSkipText('No. 63'), false, '字母数字混合照译');
assert.strictEqual(c.isSkipText('CN117729871A'), false, '专利号照译（由回同规则兜底）');
assert.strictEqual(c.isSkipText('Hello'), false);

/* ---- 2. 免译规则：译文回同原文 ---- */
assert.strictEqual(c.sameTranslation('CN117729871A', 'CN117729871A'), true);
assert.strictEqual(c.sameTranslation('CN117729871A', ' CN117729871A\n'), true, 'normalize 后一致');
assert.strictEqual(c.sameTranslation('hello', 'hello'), true);
assert.strictEqual(c.sameTranslation('hello', '你好'), false);
assert.strictEqual(c.normText('  a\n\tb  '), 'a b');

/* ---- 3. 语言检测 ---- */
assert.strictEqual(c.detectLang('This is an English sentence with the and is'), 'en');
assert.strictEqual(c.detectLang('这是中文段落'), 'zh');
assert.strictEqual(c.detectLang('これは日本語です'), 'ja');
assert.strictEqual(c.detectLang('안녕하세요 한국어'), 'ko');
assert.strictEqual(c.detectLang('Привет мир'), 'ru');

/* ---- 4. 站点规则 ---- */
assert.strictEqual(c.matchSite('example.com', 'https://www.example.com/a'), true, '整域含子域');
assert.strictEqual(c.matchSite('*.example.com', 'https://example.com/'), false, '仅子域不含主域');
assert.strictEqual(c.matchSite('*.example.com', 'https://www.example.com/'), true);
assert.strictEqual(c.matchSite('example.com/docs/*', 'https://example.com/docs/a/b'), true, '路径通配');
assert.strictEqual(c.matchSite('example.com', 'https://other.com/'), false);

/* ---- 5. 自动翻译判定（globalMode + autoRule + sourceLang） ---- */
{
  const cfg = c.parseConfig(JSON.stringify({ globalMode: 'on', autoRule: 'all', sourceLang: ['en'] }));
  assert.strictEqual(c.shouldAutoTranslate(cfg, 'https://any.com/', 'en'), true, 'all 模式语言命中');
  assert.strictEqual(c.shouldAutoTranslate(cfg, 'https://any.com/', 'ja'), false, 'all 模式语言不命中');
  const cfg2 = c.parseConfig(JSON.stringify({ globalMode: 'on', autoRule: 'sites', autoSites: [{ pattern: 'example.com', enabled: true }] }));
  assert.strictEqual(c.shouldAutoTranslate(cfg2, 'https://example.com/', 'ja'), true, 'sites 命中');
  assert.strictEqual(c.shouldAutoTranslate(cfg2, 'https://other.com/', 'en'), false);
  const cfg3 = c.parseConfig(JSON.stringify({ globalMode: 'off', autoRule: 'all', sourceLang: ['en'] }));
  assert.strictEqual(c.shouldAutoTranslate(cfg3, 'https://any.com/', 'en'), false, '关=不自动翻译');
}

/* ---- 6. 配置迁移：旧自动翻译字段 → globalMode/autoRule/sourceLang ---- */
{
  const a = c.parseConfig(JSON.stringify({ autoLangEnabled: true, autoLangs: ['en', 'de'] }));
  assert.strictEqual(a.globalMode, 'on');
  assert.strictEqual(a.autoRule, 'all');
  assert.deepStrictEqual(a.sourceLang, ['en', 'de']);
  const b = c.parseConfig(JSON.stringify({ autoEnabled: true, autoLangEnabled: false }));
  assert.strictEqual(b.globalMode, 'on');
  assert.strictEqual(b.autoRule, 'sites');
  const d = c.parseConfig(JSON.stringify({ autoEnabled: false, autoLangEnabled: false }));
  assert.strictEqual(d.globalMode, 'off');
  /* 新字段优先 */
  const e = c.parseConfig(JSON.stringify({ globalMode: 'off', autoRule: 'sites', sourceLang: ['fr'] }));
  assert.strictEqual(e.globalMode, 'off');
  assert.strictEqual(e.autoRule, 'sites');
  assert.deepStrictEqual(e.sourceLang, ['fr']);
  /* 其他迁移回归 */
  const f = c.parseConfig(JSON.stringify({ minWeight: 8, mergeCount: 8, peekTrigger: 'hold', peekKey: 'Control', scope: 'segment' }));
  assert.strictEqual(f.minLength, 8);
  assert.strictEqual(f.maxBatchChars, 4000);
  assert.strictEqual(f.peekHold, true);
  assert.strictEqual(f.peekDbl, false);
  assert.strictEqual(f.peekKey, 'ControlLeft');
  assert.strictEqual(f.scope, 'full');
}

/* ---- 7. 模型接力准入：只含启用且已配置 ---- */
{
  const models = [
    { id: 'a', endpoint: '', model: 'x', key: 'k', enabled: true },   // 未配置接口
    { id: 'b', endpoint: 'e', model: 'm', key: 'k', enabled: false }, // 已禁用
    { id: 'c', endpoint: 'e', model: 'm', key: 'k', enabled: true },    // 合格
    { id: 'd', endpoint: 'e', model: '', key: 'k', enabled: true },     // 未配置模型名
    { id: 'e', endpoint: 'e', model: 'm', key: 'k' },                    // enabled 缺省=开
    { id: 'f', endpoint: 'e', model: 'm', key: '', enabled: true },     // 远程无 Key=未配置
    { id: 'g', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'qwen', key: '', enabled: true } // 本地免 Key
  ];
  const rel = c.relayModels(models);
  assert.strictEqual(rel.length, 3, '启用+已配置（含本地免 Key）才准入');
  assert.strictEqual(rel[0].id, 'c');
  assert.strictEqual(rel[1].id, 'e');
  assert.strictEqual(rel[2].id, 'g');
  assert.strictEqual(c.modelConfigured(models[5]), false, '远程端点无 Key 不算已配置');
}

/* ---- 8. 大段直发判定（4.4） ---- */
{
  const t = 'x'.repeat(5000);
  /* maxTok 留空 → 32K 预算 → 直发 */
  const p = c.planPieces(t, 1000, 0, 90000);
  assert.strictEqual(p.direct, true);
  assert.strictEqual(p.parts.length, 1, '直发不切分');
  assert.ok(p.timeoutMs > 90000, '等待延长');
  assert.ok(p.timeoutMs <= 300000);
  /* maxTok=1k → 预算不足 → 切分 */
  const p2 = c.planPieces(t, 1000, 1, 90000);
  assert.strictEqual(p2.direct, false);
  assert.ok(p2.parts.length > 1, '超预算必须切分');
  assert.strictEqual(p2.timeoutMs, 90000);
  /* 未超 maxChars → 常规单片 */
  const p3 = c.planPieces('short text', 1000, 0, 90000);
  assert.strictEqual(p3.parts.length, 1);
  assert.strictEqual(p3.direct, false);
  /* 超大段（2 万字符）32K 预算可直发 */
  const p4 = c.planPieces('x'.repeat(20000), 1000, 0, 90000);
  assert.strictEqual(p4.direct, true, '20k 字符 32K 预算直发');
}
assert.strictEqual(c.tokenBudget(0), 32768);
assert.strictEqual(c.tokenBudget(4), 4096);
assert.ok(c.estTokens('中文abc') >= 3, 'CJK≈1 + 拉丁≈0.25 后取整');

/* ---- 9. splitLong / packBatches 回归（缩写保护/段落号/双上限） ---- */
{
  const parts = c.splitLong('A. B. C. D.', 3);
  assert.ok(Array.isArray(parts) && parts.length > 1);
  const t = 'This sentence is long enough to form a realistic paragraph segment. '.repeat(18);
  assert.strictEqual(c.splitLong(t, 4000).length, 1, '未超上限不切分');
  assert.ok(c.splitLong(t, 400).length > 1, '超上限必须切分');
  const pat = 'An apparatus. [0001] First component. [0002] Second component.';
  const pp = c.splitLong(pat, 20);
  assert.ok(pp.some(p => p.startsWith('[0001]')), '段落号归下一段');
  const units = [{ text: 'aaaa' }, { text: 'bbbb' }, { text: 'cccc' }, { text: 'dddd' }];
  const b = c.packBatches(units, 8, Infinity);
  assert.strictEqual(b.length, 2);
  const b2 = c.packBatches(units, 100, 3);
  assert.strictEqual(b2.length, 2, '条数上限');
  assert.strictEqual(c.joinParts(['a', 'b'], 'zh-Hans'), 'ab', 'CJK 直接拼接');
  assert.strictEqual(c.joinParts(['a', 'b'], 'en'), 'a b');
}

/* ---- 10. LLM 协议解析 ---- */
{
  const r = c.parseLLMReply('```json\n["甲","乙"]\n```');
  assert.deepStrictEqual(r, ['甲', '乙']);
  assert.throws(() => c.parseLLMReply('no array here'));
  const prompt = c.llmSystemPrompt('en', 'zh-Hans', c.parseConfig(''));
  assert.ok(prompt.indexOf('INPUT JSON array') > 0);
}

/* ---- 11. 迁移后的序列化回环 ---- */
{
  const cfg = c.parseConfig(JSON.stringify({ globalMode: 'on', autoRule: 'sites', sourceLang: ['ja'], models: [{ id: 'x', endpoint: 'e', model: 'm', enabled: true }] }));
  const again = c.parseConfig(c.serializeConfig(cfg));
  assert.strictEqual(again.autoRule, 'sites');
  assert.deepStrictEqual(again.sourceLang, ['ja']);
  assert.strictEqual(again.models.length, 1);
}

/* ---- 12. storage.sync 分片回环 + 字节上限 ---- */
{
  const big = JSON.stringify({ data: '青'.repeat(20000) }); // 远超 8KB
  const items = tlSyncPack('cfg', big);
  const keys = Object.keys(items).filter(k => k !== 'tlsc:cfg:n');
  for (const k of keys) {
    assert.ok(Buffer.byteLength(items[k], 'utf8') <= TL_SYNC_CHUNK_BYTES, '片不超过字节上限');
  }
  assert.strictEqual(tlSyncUnpack(items, 'cfg'), big);
  assert.strictEqual(tlSyncUnpack({ 'tlsc:cfg:n': '2', 'tlsc:cfg:0': 'a' }, 'cfg'), null, '缺片返回 null');
  assert.strictEqual(tlSyncUnpack({ 'tlsc:other:n': '1', 'tlsc:other:0': 'z' }, 'cfg'), null, '键隔离');
  const small = tlSyncPack('cfg', '{"a":1}');
  assert.strictEqual(small['tlsc:cfg:n'], '1');
}

/* ---- 13. behaviorRules 站点级：site='*' 全局 / 站点匹配 / 旧 scope+pattern 迁移 ---- */
{
  const cfg = c.parseConfig(JSON.stringify({
    behaviorBuiltinApplied: true, // 模拟已升级用户：不重复补入内置规则
    xpathRules: [
      { site: '*', xpath: '//nav', mode: 'skip', enabled: true },
      { site: 'example.com', xpath: '//code', mode: 'inline', enabled: true },
      { site: '*.test.org/docs/*', xpath: '//aside', mode: 'trans', enabled: true },
      { site: 'other.com', xpath: '//footer', mode: 'skip', enabled: false },
      { scope: 'site', pattern: 'legacy.com', xpath: '//header', mode: 'skip', enabled: true },
      { scope: 'all', xpath: '//script', mode: 'skip', enabled: true }
    ]
  }));
  assert.strictEqual(cfg.behaviorRules.length, 6);
  assert.ok(cfg.behaviorRules.every(r => r.kind === 'xpath'), '旧规则迁移为 xpath 类');
  assert.deepStrictEqual(cfg.behaviorRules.map(r => r.site),
    ['*', 'example.com', '*.test.org/docs/*', 'other.com', 'legacy.com', '*']);
  assert.deepStrictEqual(cfg.behaviorRules.map(r => r.mode),
    ['skip', 'inline', 'trans', 'skip', 'skip', 'skip']);
  assert.ok(cfg.behaviorRules.every(r => r.scope === undefined && r.pattern === undefined), '旧字段已清除');
  assert.ok(cfg.xpathRules === undefined, '旧 xpathRules 字段已下线');

  assert.deepStrictEqual(c.activeXPathRules(cfg, 'https://example.com/a').map(r => r.xpath),
    ['//nav', '//script', '//code'], '全局规则在前、站点规则在后');
  assert.deepStrictEqual(c.activeXPathRules(cfg, 'https://docs.test.org/docs/readme').map(r => r.xpath),
    ['//nav', '//script', '//aside'], '子域 + 路径通配命中');
  assert.deepStrictEqual(c.activeXPathRules(cfg, 'https://legacy.com/').map(r => r.xpath),
    ['//nav', '//script', '//header'], '旧结构迁移后生效');
  assert.strictEqual(c.activeXPathRules(cfg, 'https://nobody.com/').length, 2, '禁用规则与不命中站点均不生效');
  assert.strictEqual(c.xpathRuleSite({ site: '' }), '*', '空站点视为全局');
  assert.strictEqual(c.xpathRuleSite({ scope: 'site', pattern: 'a.com' }), 'a.com', '旧结构兜底');

  const again = c.parseConfig(c.serializeConfig(cfg));
  assert.deepStrictEqual(again.behaviorRules, cfg.behaviorRules, '序列化回环保留 site');
}

/* ---- 14. 内置翻译行为规则：默认 / 首次升级补入 / 删除后不复活 ---- */
{
  const fresh = c.parseConfig('');
  assert.strictEqual(fresh.behaviorRules.length, 4, '新装默认 3 条正则 + 1 条 XPath');
  assert.strictEqual(fresh.behaviorRules.filter(r => r.kind === 'regex').length, 3);
  assert.ok(fresh.behaviorRules.filter(r => r.kind === 'regex').every(r => r.site === '*' && r.mode === 'skip'));
  const r = fresh.behaviorRules.find(x => x.kind === 'xpath');
  assert.strictEqual(r.site, '*.zhihuiya.com');
  assert.strictEqual(r.mode, 'inline', '专利标题双语不换行');
  assert.ok(r.expr.includes('normalize-space(@class)'), '使用合法的标准 class token 匹配');
  assert.deepStrictEqual(c.activeXPathRules(fresh, 'https://analytics.zhihuiya.com/patent').map(x => x.xpath),
    [r.expr], '智慧芽子域命中');
  assert.strictEqual(c.activeXPathRules(fresh, 'https://zhihuiya.com/').length, 0, '仅子域、不含主域');

  /* 老配置首次升级：补入内置规则一次并置标记 */
  const old = c.parseConfig(JSON.stringify({ xpathRules: [{ site: '*', xpath: '//nav', mode: 'skip', enabled: true }] }));
  assert.strictEqual(old.behaviorRules.length, 5);
  assert.strictEqual(old.behaviorBuiltinApplied, true);
  const removed = c.parseConfig(c.serializeConfig(old));
  assert.strictEqual(removed.behaviorRules.length, 5, '标记生效，不再追加');
  const deleted = c.parseConfig(c.serializeConfig(Object.assign({}, removed, {
    behaviorRules: removed.behaviorRules.filter(x => x.id !== 'b-email')
  })));
  assert.strictEqual(deleted.behaviorRules.length, 4, '删除后不复活');
  assert.ok(!deleted.behaviorRules.some(x => x.id === 'b-email'));
}

/* ---- 15. 正则跳过：完整段落匹配 / 内置三类 / 自定义 / 非法与超长保护 ---- */
{
  const rules = c.activeRegexRules(c.parseConfig(''), 'https://example.com/p');
  assert.strictEqual(rules.length, 3, '默认 3 条正则、站点 * 全局');
  for (const s of ['CN117729871A', 'US-2024/0123456-A1', 'WM-3900H',
    'support@zhihuiya.com', 'https://example.com/patent/12345', 'WWW.Example.COM/a']) {
    assert.strictEqual(c.shouldSkipByRules(s, rules), true, '应跳过：' + s);
  }
  for (const s of ['sen a email to lily@gmail.com', 'Fig. 1', 'No. 63',
    'As disclosed in CN117729871A, the spray arm rotates.',
    '本发明涉及 CN117729871A 公开的一种洗碗机控制方法。',
    'The apparatus comprises a housing and a control unit.']) {
    assert.strictEqual(c.shouldSkipByRules(s, rules), false, '不应跳过（段内含正常语句）：' + s);
  }
  const custom = [{ expr: '^(?:Fig\\.|No\\.)\\s*\\d+$', builtin: false, flags: '', enabled: true }];
  assert.strictEqual(c.shouldSkipByRules('Fig. 1', custom), true, '自定义规则可补内置未覆盖的编号');
  assert.strictEqual(c.shouldSkipByRules('See Fig. 1 for details', custom), false, '自定义同样遵守全段匹配');
  assert.strictEqual(c.shouldSkipByRules('anything', [{ expr: '(', builtin: false, flags: '', enabled: true }]), false, '非法正则视为不生效');
  assert.strictEqual(c.shouldSkipByRules('x'.repeat(600), rules), false, '超长段不执行正则');
  assert.strictEqual(c.compileSkipRule({ expr: 'a', flags: 'gi' }).flags, 'i', '过滤 g/y 防 lastIndex 跨段');
  assert.strictEqual(c.shouldSkipByRules('a', [{ expr: 'a', enabled: false }]), false, '禁用规则不生效');
  /* 站点级正则：只在匹配站点生效 */
  const cfg = c.parseConfig(JSON.stringify({
    behaviorBuiltinApplied: true,
    behaviorRules: [{ id: 'x', kind: 'regex', site: 'patents.example.com', expr: 'CN\\d+[A-Z]', mode: 'skip', enabled: true }]
  }));
  assert.strictEqual(c.activeRegexRules(cfg, 'https://patents.example.com/').length, 1);
  assert.strictEqual(c.activeRegexRules(cfg, 'https://other.com/').length, 0);
}

/* ---- 16. 提示词模板库：站点自动套用 / 旧三字段迁移 / manualScope ---- */
{
  const cfg = c.parseConfig(JSON.stringify({
    behaviorBuiltinApplied: true, promptsMigrated: true,
    promptPreset: 'general', manualScope: 'domain',
    prompts: [
      { id: 'u1', name: '通配站点', text: 'SITE-A', site: '*.example.com', enabled: true },
      { id: 'u2', name: '精确站点', text: 'SITE-B', site: 'patents.example.com', enabled: true },
      { id: 'u3', name: '普通模板', text: 'GLOBAL-TPL', site: '', enabled: true }
    ]
  }));
  assert.strictEqual(c.allPrompts(cfg).length, 6, '内置 3 条 + 用户 3 条');
  assert.strictEqual(c.activePromptText(cfg, 'https://patents.example.com/a'), 'SITE-B', '精确站点优先于通配站点');
  assert.strictEqual(c.activePromptText(cfg, 'https://docs.example.com/a'), 'SITE-A');
  assert.strictEqual(c.activePromptText(cfg, 'https://other.com/'), c.PROMPT_PRESETS[0].text, '无命中回退全局设置');
  assert.strictEqual(c.activePromptText(cfg, ''), c.PROMPT_PRESETS[0].text);
  assert.strictEqual(cfg.manualScope, 'domain');
  assert.strictEqual(c.parseConfig('').manualScope, 'page', '默认当前页');

  /* 旧 promptCustom / promptTemplates / promptPreset=custom 一次性迁移 */
  const old = c.parseConfig(JSON.stringify({
    behaviorBuiltinApplied: true,
    promptTemplates: [{ id: 't1', name: '我的模板', text: 'TEXT-A' }],
    promptCustom: 'TEXT-B', promptCustomName: '自定义B', promptPreset: 'custom'
  }));
  assert.strictEqual(old.prompts.length, 5, 'v1.4：3 条内置实体化 + 2 条旧用户模板');
  assert.strictEqual(old.prompts.filter(p => p.builtin).length, 3);
  assert.strictEqual(old.promptPreset, 'u-custom');
  assert.strictEqual(c.activePromptText(old, ''), 'TEXT-B');
  assert.strictEqual(old.promptsMigrated, true);
  const again = c.parseConfig(c.serializeConfig(old));
  assert.strictEqual(c.activePromptText(again, ''), 'TEXT-B', '迁移结果序列化回环稳定');
  assert.ok(c.llmSystemPrompt('auto', 'zh-Hans', cfg).includes('DIFFERENT'), '混批措辞：逐条独立判定源语言');
}

/* ---- 17. v1.4：站点多值 / 规则命名 / 正则 inline|trans / 内置提示词可编辑 ---- */
{
  assert.deepStrictEqual(c.splitSites('a.com;*.b.com，c.com；d.com'), ['a.com', '*.b.com', 'c.com', 'd.com']);
  assert.strictEqual(c.matchSiteList('a.com;*.b.com', 'https://x.b.com/p'), true);
  assert.strictEqual(c.matchSiteList('a.com,b.com', 'https://c.com/'), false);
  assert.strictEqual(c.isGlobalSite('*'), true);
  assert.strictEqual(c.isGlobalSite('a.com'), false);

  const cfg = c.parseConfig(JSON.stringify({
    promptsBuiltinApplied: true, promptPreset: 'general',
    prompts: [
      { id: 'u1', name: '通配', text: 'SITE-A', site: '*.example.com', enabled: true },
      { id: 'u2', name: '精确', text: 'SITE-B', site: 'patents.example.com;other.com', enabled: true },
      { id: 'u3', name: '普通', text: 'GLOBAL', site: '', enabled: true }
    ]
  }));
  assert.strictEqual(c.activePromptText(cfg, 'https://patents.example.com/a'), 'SITE-B', '精确站点优先');
  assert.strictEqual(c.activePromptText(cfg, 'https://other.com/'), 'SITE-B', '分号分隔的第二站点也应命中');
  assert.strictEqual(c.activePromptText(cfg, 'https://docs.example.com/'), 'SITE-A');
  assert.strictEqual(c.activePromptText(cfg, 'https://nobody.com/'), c.PROMPT_PRESETS[0].text, '无命中回退全局');

  /* 内置模板实体化后可直接编辑站点并立即生效 */
  const ed = c.parseConfig('');
  const patent = ed.prompts.find(p => p.id === 'patent');
  assert.ok(patent && patent.builtin, '内置模板应实体化进 prompts');
  patent.site = '*.zhihuiya.com';
  assert.strictEqual(c.activePromptText(ed, 'https://analytics.zhihuiya.com/p'), patent.text);
  assert.strictEqual(c.builtinPrompts().length, 3);

  /* 正则类 mode 放开：skip 过滤、inline/trans 打标 */
  const br = c.parseConfig(JSON.stringify({
    behaviorBuiltinApplied: true,
    behaviorRules: [
      { id: 'r1', kind: 'regex', site: '*', name: '编号不译', expr: '[A-Z]{2}[0-9]+', mode: 'skip', enabled: true },
      { id: 'r2', kind: 'regex', site: '*', name: '标题不换行', expr: 'TITLE-[0-9]+', mode: 'inline', enabled: true },
      { id: 'r3', kind: 'regex', site: '*', name: '仅译文', expr: 'ONLY-[0-9]+', mode: 'trans', enabled: true }
    ]
  }));
  const rr = c.activeRegexRules(br, 'https://x.com/');
  assert.deepStrictEqual(rr.map(r => r.mode), ['skip', 'inline', 'trans'], '正则类不再锁 skip');
  assert.ok(rr.every(r => r.name), '规则必须有名称');
  assert.strictEqual(c.shouldSkipByRules('AB12', rr), true);
  assert.strictEqual(c.shouldSkipByRules('TITLE-7', rr), false, 'inline 规则不应跳过段落');
  assert.strictEqual(c.regexMarkFor('TITLE-7', rr), 'inline');
  assert.strictEqual(c.regexMarkFor('ONLY-8', rr), 'trans');
  assert.strictEqual(c.regexMarkFor('See TITLE-7 here', rr), null, '段内包含不命中');
  assert.strictEqual(c.shouldSkipByRules('AB12', [{ expr: '[A-Z]{2}[0-9]+', enabled: true }]), true, '未指定 mode 兼容为 skip');
  /* 规则站点也支持多值 */
  const sr = c.parseConfig(JSON.stringify({
    behaviorBuiltinApplied: true,
    behaviorRules: [{ id: 's1', kind: 'regex', site: 'a.com;b.com', name: '双站点', expr: 'ZZ[0-9]+', mode: 'skip', enabled: true }]
  }));
  assert.strictEqual(c.activeRegexRules(sr, 'https://b.com/').length, 1);
  assert.strictEqual(c.activeRegexRules(sr, 'https://c.com/').length, 0);
}

console.log('ALL PASS: 17 组核心用例通过（免译/迁移/接力准入/大段直发/切分打包/LLM 协议/分片/behaviorRules/正则全段匹配/提示词站点套用/v1.4 多站点与正则行为）');
