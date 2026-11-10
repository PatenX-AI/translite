/* 分段抽取逻辑自测（迷你 DOM 桩） */
const fs = require('fs');
const assert = require('assert');

/* ---- 迷你 DOM ---- */
function el(tag, children = [], attrs = {}) {
  const node = {
    nodeType: 1, tagName: tag.toUpperCase(), attrs, childNodes: children,
    parentElement: null, parentNode: null,
    get firstChild() { return this.childNodes[0] || null; },
    get nextSibling() {
      if (!this.parentNode) return null;
      const i = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[i + 1] || null;
    },
    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        for (const part of sel.split(',')) {
          const s = part.trim();
          if (/^[A-Z0-9-]+$/i.test(s) && cur.tagName === s.toUpperCase()) return cur;
          if (s.startsWith('.') && cur.attrs.class && cur.attrs.class.split(' ').includes(s.slice(1))) return cur;
          if (s.startsWith('[') && s.endsWith(']')) {
            const body = s.slice(1, -1);
            const [k, v] = body.split('=');
            if (v !== undefined) {
              const val = v.replace(/^["']|["']$/g, '');
              if (cur.attrs[k] === val) return cur;
            } else if (k in cur.attrs) return cur;
          }
        }
        cur = cur.parentElement;
      }
      return null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    get isConnected() { return true; }
  };
  children.forEach(c => { c.parentElement = node; c.parentNode = node; });
  return node;
}
function text(s) {
  return { nodeType: 3, nodeValue: s, parentElement: null, parentNode: null,
    get nextSibling() {
      if (!this.parentNode) return null;
      const i = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[i + 1] || null;
    } };
}

/* 汇总求值作用域 */
const sandbox = `
function esc(s){return String(s==null?'':s);}
function debounce(fn,ms){return fn;}
function sleep(ms){return Promise.resolve();}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function textWeight(s){let w=0;for(const ch of String(s)){if(/[\\u2E80-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u30FF\\uAC00-\\uD7AF]/.test(ch))w+=1;else if(/\\s/.test(ch))w+=0;else w+=0.5;}return w;}
function detectLang(s){
  const t=String(s);let cjk=0,kana=0,hangul=0,latin=0,cyr=0,total=0;
  for(const ch of t){if(/\\s/.test(ch))continue;total++;
    if(/[\\u3040-\\u30FF]/.test(ch))kana++;else if(/[\\uAC00-\\uD7AF]/.test(ch))hangul++;
    else if(/[\\u4E00-\\u9FFF]/.test(ch))cjk++;else if(/[A-Za-z]/.test(ch))latin++;
    else if(/[\\u0400-\\u04FF]/.test(ch))cyr++;}
  if(!total)return 'other';
  if(kana/total>0.1)return 'ja';if(hangul/total>0.1)return 'ko';
  if(cjk/total>0.2)return 'zh';if(cyr/total>0.2)return 'ru';
  if(latin/total>0.5)return 'en';return 'other';
}
function isPureSymbol(s){return !/[\\p{L}\\p{N}]/u.test(String(s));}
function hashStr(s){let h=0x811c9dc5;const t=String(s);for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;}return h.toString(16);}
var Cfg={minLength:0,tgtLang:'zh-Hans',inlineThreshold:30};
var LANG_BASE={'zh-Hans':'zh','en':'en','ja':'ja','ko':'ko'};
function getComputedStyle(el){
  // 模拟 flex 子项被块级化（真实浏览器中 span 作为 flex item 的 display 为 block）
  if (el && el.attrs && el.attrs['data-flex-item']) return { display: 'block' };
  return { display: 'inline' };
}
`;

const src = fs.readFileSync(__dirname + '/src/04-translate.js', 'utf8');
const pick = (name) => {
  const re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('cannot extract ' + name);
  return m[0];
};
const pickConst = (name) => {
  const re = new RegExp('const ' + name + ' = new Set\\(\\[[\\s\\S]*?\\]\\);', 'm');
  return src.match(re)[0];
};

eval(sandbox
  + pickConst('SKIP_TAGS') + pickConst('BLOCK_TAGS') + pickConst('UNIT_TAGS') + pickConst('INLINE_TAGS')
  + pick('isSkippable') + pick('breaksLine') + pick('translatable')
  + pick('collectSegments') + pick('segText')
  + pick('splitLong') + pick('joinParts') + pick('packBatches'));

/* ---- 用例 ---- */
function segsOf(root) {
  return collectSegments(root).map(s => segText(s));
}

// 1. mark 标签不得打断单词
{
  const root = el('div', [
    text('A filter assembly that includes a filter housing and the p'),
    el('mark', [text('ro')], { 'data-markjs': 'true' }),
    text('per type. When done.')
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 1, 'mark 内联应合并为 1 段, got ' + JSON.stringify(segsOf(root)));
  assert.strictEqual(segText(segs[0]), 'A filter assembly that includes a filter housing and the proper type. When done.');
  assert.strictEqual(segs[0].kind, 'line', '独占一行应为 line');
}

// 2. div/p/br 导致分行
{
  const root = el('div', [
    text('line one'),
    el('br'),
    text('line two'),
    el('p', [text('para two')])
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 3, 'br/p 分行: ' + JSON.stringify(segsOf(root)));
  assert.strictEqual(segText(segs[0]), 'line one');
  assert.strictEqual(segText(segs[1]), 'line two');
  assert.strictEqual(segText(segs[2]), 'para two');
  assert.ok(segs.every(s => s.kind === 'line'));
}

// 3. 【CNET 案例】行内链接不打断整句：句子合并为 1 段
{
  const root = el('p', [
    text('The platform is operated by the '),
    el('a', [el('span', [text('Organization for Transformative Works')])]),
    text('. An update posted Thursday to the site\u2019s '),
    el('span', [
      el('a', [el('span', [text('status page')])]),
      el('span', [text(' and shared via Bluesky and Tumblr said that service restoration will take at least two weeks, possibly four')])
    ]),
    text('. ')
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 1, '行内链接不得打散整句: ' + JSON.stringify(segsOf(root)));
  const t = segText(segs[0]);
  assert.ok(t.startsWith('The platform is operated by the Organization'), '句首完整: ' + t);
  assert.ok(t.includes('status page and shared'), '句中链接文本并入: ' + t);
  assert.ok(t.endsWith('possibly four.'), '句尾完整: ' + t);
  assert.strictEqual(segs[0].kind, 'line');
}

// 4. 导航链接列表各自成段（行内片段）
{
  const root = el('nav', [
    el('a', [text('Home')]),
    el('a', [text('About')]),
    el('a', [text('Contact')])
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 3);
  assert.strictEqual(segText(segs[0]), 'Home');
  assert.strictEqual(segText(segs[1]), 'About');
  assert.ok(segs.every(s => s.kind === 'frag'), '链接列表应为 frag');
}

// 5. 上/下篇 + 分隔符：链接列表拆分，分隔符独立（后续由最小长度过滤）
{
  const root = el('p', [
    el('a', [text('Prev article')]),
    text(' | '),
    el('a', [text('Next article')])
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 3, JSON.stringify(segsOf(root)));
  assert.strictEqual(segText(segs[0]), 'Prev article');
  assert.strictEqual(segText(segs[2]), 'Next article');
  assert.ok(segs.every(s => s.kind === 'frag'));
}

// 6. span/b/em 等格式标签全部合并
{
  const root = el('div', [
    text('Hello '),
    el('span', [el('b', [text('wor')]), text('ld')]),
    el('em', [text('!')])
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segText(segs[0]), 'Hello world!');
}

// 7. br 切开：单链接为独立段 + 独立行
{
  const root = el('div', [
    el('a', [text('link')]),
    el('br'),
    text('standalone line text here')
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 2);
  assert.strictEqual(segText(segs[0]), 'link');
  assert.strictEqual(segText(segs[1]), 'standalone line text here');
  assert.strictEqual(segs[1].kind, 'line');
}

// 8. 用户示例：proper / from 不得被隔断
{
  const root = el('div', [
    text('When the p'),
    el('mark', [text('ro')], { 'data-markjs': 'true' }),
    text('per filter cartridge is inserted, the blocker f'),
    el('mark', [text('ro')], { 'data-markjs': 'true' }),
    text('m being fully inserted into the housing.')
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 1, 'got ' + JSON.stringify(segsOf(root)));
  const t = segText(segs[0]);
  assert.ok(t.includes('proper filter'), '单词 proper 不得被隔断: ' + t);
  assert.ok(t.includes('from being'), '单词 from 不得被隔断: ' + t);
  assert.ok(!/\s{2,}/.test(t), '不得出现异常空白');
}

// 9. flex 子项（计算样式为 block）不得被合并成一段
{
  const root = el('div', [
    el('span', [text('Short card A')], { 'data-flex-item': '1' }),
    el('span', [text('Short card B')], { 'data-flex-item': '1' }),
    el('span', [text('Short card C')], { 'data-flex-item': '1' })
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 3, 'flex 子项应各自成段: ' + JSON.stringify(segsOf(root)));
  assert.strictEqual(segText(segs[0]), 'Short card A');
  assert.ok(segs.every(s => s.kind === 'line'));
}

// 10. 标题含单链接：整体 1 段（标题漏译回归）
{
  const root = el('h3', [
    el('a', [text('CES 2026: The 5 biggest announcements so far')])
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segText(segs[0]), 'CES 2026: The 5 biggest announcements so far');
  assert.strictEqual(segs[0].kind, 'line');
}

// 11. 按钮恒独立成段，不并入正文
{
  const root = el('p', [
    text('Click '),
    el('button', [text('Submit')]),
    text(' to continue with the form submission process')
  ]);
  const segs = collectSegments(root);
  assert.strictEqual(segs.length, 3, JSON.stringify(segsOf(root)));
  assert.strictEqual(segText(segs[1]), 'Submit');
  assert.ok(segs.every(s => s.kind === 'frag'));
}

// 12. splitLong：短文本不切
{
  const parts = splitLong('Hello world.', 600);
  assert.strictEqual(parts.length, 1);
  assert.strictEqual(parts[0], 'Hello world.');
}

// 13. splitLong：千字长段按句边界切分，每片 ≤ 600
{
  const sentence = 'This is a long sentence used to build a very long paragraph for testing purposes. ';
  const long = sentence.repeat(30); // ≈ 2460 字符
  assert.ok(long.length > 1000, 'precondition: text over 1000 chars');
  const parts = splitLong(long, 600);
  assert.ok(parts.length > 1, 'long text must split: ' + parts.length);
  assert.ok(parts.every(p => p.length <= 600), 'every part ≤ 600: ' + parts.map(p => p.length).join(','));
  assert.strictEqual(parts.join(''), long, 'split must be lossless');
  assert.ok(parts.every(p => p.trim().length), 'no empty parts');
}

// 14. splitLong：单句超长按空格硬切
{
  const giant = ('word '.repeat(200)).trim(); // 单句约 999 字符无句号
  const parts = splitLong(giant, 600);
  assert.ok(parts.length > 1, 'giant sentence must split');
  assert.ok(parts.every(p => p.length <= 600), 'giant parts ≤ 600');
  assert.strictEqual(parts.join(''), giant, 'giant split lossless');
}

// 15. splitLong：含句号的中英混合千字段 → joinParts 中文直接拼接
{
  Cfg.tgtLang = 'zh-Hans';
  const long = 'The filter housing includes a radio frequency identification reader. '.repeat(20);
  const parts = splitLong(long, 600);
  assert.ok(parts.length > 1);
  const joined = joinParts(parts.map(p => '【译】' + p.slice(0, 10)));
  assert.ok(!joined.includes(' 【译】'), 'zh target join without spaces: ' + joined.slice(0, 40));
  Cfg.tgtLang = 'en';
  const joinedEn = joinParts(['Hello', 'world']);
  assert.strictEqual(joinedEn, 'Hello world', 'en target join with space');
  Cfg.tgtLang = 'zh-Hans';
}

// 16. splitLong：缩写保护（FIG. 1 / May 8. 2025 / No. 63）不产生句边界
{
  const t = 'See FIG. 1 for the embodiment shown there. The cartridge of FIG. 8 engages the seat clockwise. '
    + 'Filed May 8. 2025 under Serial No. 63/677,845, the contents are incorporated herein.';
  const parts = splitLong(t, 100);
  assert.strictEqual(parts.join(''), t, 'lossless');
  assert.ok(parts.length > 1, 'precondition: 必须发生切分');
  for (const p of parts) {
    assert.ok(!/(FIGs?|No)\.$/.test(p.trim()), '分片不得止于缩写: ' + JSON.stringify(p));
  }
  assert.ok(parts.some(p => p.includes('FIG. 1')), 'FIG. 1 保持完整');
  assert.ok(parts.some(p => p.includes('May 8. 2025')), 'May 8. 2025 保持完整');
  assert.ok(parts.some(p => p.includes('No. 63/677,845')), 'Serial No. 63 保持完整');
}

// 17. splitLong：专利段落号 [0001] 前可断，段落号归下一段
{
  const t = 'The present invention relates to filters. BACKGROUND [0001] The present invention relates generally to drinking water. [0002] Known filter systems include a reservoir.';
  const parts = splitLong(t, 100);
  assert.strictEqual(parts.join(''), t, 'lossless');
  assert.ok(parts.some(p => p.startsWith('[0001]')), '段落号归下一段: ' + JSON.stringify(parts));
  assert.ok(parts.some(p => p.startsWith('[0002]')), '段落号归下一段');
}

// 18. packBatches：按最大字符数反推合并批数 + 条数上限 + 超长片独占
{
  const units = [{ text: 'aaaa' }, { text: 'bbbb' }, { text: 'cccc' }, { text: 'dddd' }];
  const b = packBatches(units, 8, Infinity);
  assert.strictEqual(b.length, 2, '4×4 字符按 8 字符/批 → 2 批');
  assert.strictEqual(b[0].length, 2);
  assert.strictEqual(b[1].length, 2);
  const b2 = packBatches(units, 100, 3);
  assert.strictEqual(b2.length, 2, '条数上限 3 → 3+1');
  assert.strictEqual(b2[0].length, 3);
  const b3 = packBatches([{ text: 'x'.repeat(50) }, { text: 'yy' }], 10, Infinity);
  assert.strictEqual(b3.length, 2, '超长片独占一批');
  assert.strictEqual(b3[0].length, 1);
  assert.strictEqual(b3[1].length, 1);
}

// 19. splitLong：单段超过最大字符数才切分（上限由参数传入，默认 1000）
{
  const t = 'This sentence is long enough to form a realistic paragraph segment. '.repeat(18);
  assert.ok(t.length > 1000 && t.length < 4000, 'precondition: 1000~4000 字符, got ' + t.length);
  assert.strictEqual(splitLong(t, 4000).length, 1, '未超过上限不得切分');
  assert.ok(splitLong(t, 400).length > 1, '超过上限必须切分');
  assert.ok(splitLong(t).length > 1, '默认上限 1000：超过必须切分');
}

console.log('ALL PASS: 19 个分段/切分/打包用例通过');
