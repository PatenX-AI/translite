/* test-gate.js — 全局开关总闸（动态注册/注销 + 已开页自毁/唤醒）集成测试 */
const fs = require('fs');
const assert = require('assert');

let cfgRaw = JSON.stringify({ engine: 'microsoft', globalMode: 'on' });
const registered = [];
const log = [];
const msgHandlers = [];
const changeHandlers = [];
let contentAlive = true; // 模拟页面里已驻留的 content script

const storageLocal = {
  get() { return Promise.resolve({ tl_config_v1: cfgRaw }); },
  set(o) { if (o.tl_config_v1 !== undefined) cfgRaw = o.tl_config_v1; return Promise.resolve(); },
  remove() { return Promise.resolve(); }
};
global.browser = {
  storage: {
    local: storageLocal,
    sync: { get() { return Promise.resolve({}); }, set() { return Promise.resolve(); } },
    onChanged: { addListener(fn) { changeHandlers.push(fn); } }
  },
  runtime: {
    onMessage: { addListener(fn) { msgHandlers.push(fn); } },
    sendMessage() { return Promise.resolve(); }
  },
  browserAction: { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} },
  commands: { onCommand: { addListener() {} } },
  tabs: {
    onRemoved: { addListener() {} },
    query() { return Promise.resolve([{ id: 1, url: 'https://example.com/' }]); },
    sendMessage(tabId, msg) {
      log.push('tab:' + msg.cmd);
      if (!contentAlive) return Promise.reject(new Error('no content'));
      if (msg.cmd === 'ping') return Promise.resolve({ ok: true, dead: false });
      return Promise.resolve({ ok: true });
    }
  },
  scripting: {
    async getRegisteredContentScripts() { return registered.slice(); },
    async registerContentScripts(s) { for (const x of s) registered.push(x); log.push('register'); },
    async unregisterContentScripts(f) {
      for (let i = registered.length - 1; i >= 0; i--) if ((f.ids || []).includes(registered[i].id)) registered.splice(i, 1);
      log.push('unregister');
    },
    async executeScript(o) { log.push('inject:' + o.files.join('+')); }
  }
};
global.fetch = () => Promise.resolve({ status: 404, text: () => Promise.resolve('') });

const core = fs.readFileSync(__dirname + '/extension/lib/core.js', 'utf8');
const sync = fs.readFileSync(__dirname + '/extension/lib/sync-chunks.js', 'utf8');
const bg = fs.readFileSync(__dirname + '/extension/background.js', 'utf8');
(0, eval)(core + '\n' + sync + '\n' + bg);

function setCfg(o) { cfgRaw = JSON.stringify(o); changeHandlers.forEach(f => f({ tl_config_v1: { newValue: cfgRaw } }, 'local')); }
const tick = () => new Promise(r => setTimeout(r, 30));

(async () => {
  await tick();
  /* 1. 启动即按 on 注册 */
  assert.ok(log.includes('register'), '开启时动态注册 content script');
  assert.ok(log.includes('tab:ping'), '已打开页先探测驻留实例');

  /* 2. 关闭 → 注销 + 广播 destroy */
  log.length = 0;
  setCfg({ engine: 'microsoft', globalMode: 'off' });
  await tick();
  assert.ok(log.includes('unregister'), '关闭时注销 content script');
  assert.ok(log.includes('tab:destroy'), '关闭时广播自毁');
  assert.strictEqual(registered.length, 0, '注册已清空');

  /* 3. 关闭期间不再注入页面 */
  contentAlive = false;
  log.length = 0;
  setCfg({ engine: 'microsoft', globalMode: 'off', tgtLang: 'en' });
  await tick();
  assert.ok(!log.some(x => x.startsWith('inject:')), '关闭状态零注入');

  /* 4. 重新开启 → 注册 + 对无脚本页面注入 */
  log.length = 0;
  setCfg({ engine: 'microsoft', globalMode: 'on' });
  await tick();
  assert.ok(log.includes('register'), '重开时重新注册');
  assert.ok(log.some(x => x.startsWith('inject:')), '无驻留脚本的页面按需注入');

  /* 5. 驻留实例走 revive，不重复注入 core.js */
  contentAlive = true;
  log.length = 0;
  setCfg({ engine: 'microsoft', globalMode: 'off' });
  await tick();
  log.length = 0;
  setCfg({ engine: 'microsoft', globalMode: 'on' });
  await tick();
  assert.ok(!log.some(x => x.startsWith('inject:')), '驻留实例不重复注入');
  assert.ok(log.includes('register'), '重开仍注册未来页面');

  /* 6. 总闸关闭时 background 拒绝翻译请求 */
  setCfg({ engine: 'microsoft', globalMode: 'off' });
  await tick();
  const resp = await new Promise(resolve => {
    const handled = msgHandlers[0]({ type: 'translate', texts: ['Hello'] }, {}, resolve);
    if (handled !== true) resolve(undefined);
  });
  assert.ok(resp && resp.ok === false, '关闭时翻译请求被拒绝');

  /* 7. 手动翻译范围：当前域名会话标记 + 广播 + 总闸关闭清空 */
  const sendMsg = (msg, sender) => new Promise(resolve => {
    const handled = msgHandlers[0](msg, sender || {}, resolve);
    if (handled !== true) resolve(undefined);
  });
  setCfg({ engine: 'microsoft', globalMode: 'on' });
  await tick();
  log.length = 0;
  assert.strictEqual((await sendMsg({ type: 'queryDomain', host: 'a.com' })).marked, false);
  assert.strictEqual((await sendMsg({ type: 'markDomain', host: 'a.com' }, { tab: { id: 9 } })).marked, true);
  await tick();
  assert.ok(log.includes('tab:domainAuto'), '同域其它页应收到自动翻译广播');
  assert.strictEqual((await sendMsg({ type: 'queryDomain', host: 'a.com' })).marked, true);
  assert.strictEqual((await sendMsg({ type: 'queryDomain', host: 'b.com' })).marked, false, '按主机名精确隔离');
  setCfg({ engine: 'microsoft', globalMode: 'off' });
  await tick();
  assert.strictEqual((await sendMsg({ type: 'queryDomain', host: 'a.com' })).marked, false, '总闸关闭清空域名标记');

  console.log('ALL PASS: 全局开关总闸用例通过（注册/注销/注入/唤醒/拒绝请求/域名范围）');
})().catch(e => { console.error(e); process.exit(1); });
