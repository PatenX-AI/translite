/* test-sync-chunks.js — storage.sync 分片 pack/unpack 单测（node test-sync-chunks.js） */
const assert = require('assert');
const { tlSyncPack, tlSyncUnpack, TL_SYNC_CHUNK_BYTES } = require('./extension/lib/sync-chunks.js');

const enc = new TextEncoder();

function roundTrip(key, str) {
  const items = tlSyncPack(key, str);
  const back = tlSyncUnpack(items, key);
  assert.strictEqual(back, str, 'round trip failed for len=' + String(str).length);
  return items;
}

// 1. ASCII 短串
roundTrip('k', 'hello world');

// 2. 空串（pack 出 1 片，unpack 回空串而非 null）
assert.strictEqual(tlSyncUnpack(tlSyncPack('k', ''), 'k'), '');

// 3. 中文长串（1.5 万字符 → 必须多片）
const cjk = '轻译翻译配置同步测试'.repeat(1500);
const itemsCjk = roundTrip('tl_config_v1', cjk);
const nCjk = Number(itemsCjk['tlsc:tl_config_v1:n']);
assert.ok(nCjk > 1, 'cjk should split into multiple chunks, got ' + nCjk);

// 4. 混合 emoji（代理对不可拆分）
const emoji = 'a😀b🎉c'.repeat(2000);
roundTrip('k', emoji);

// 5. 每片字节数不超过上限（UTF-8 字节）
const big = ('x'.repeat(100) + '中').repeat(500);
const itemsBig = tlSyncPack('k', big);
const nBig = Number(itemsBig['tlsc:k:n']);
assert.ok(nBig > 1, 'big should split');
for (let i = 0; i < nBig; i++) {
  const bytes = enc.encode(itemsBig['tlsc:k:' + i]).length;
  assert.ok(bytes <= TL_SYNC_CHUNK_BYTES, 'chunk ' + i + ' bytes=' + bytes + ' exceeds ' + TL_SYNC_CHUNK_BYTES);
}

// 6. 缺片 → null
const broken = tlSyncPack('k', 'abc'.repeat(5000));
const n = Number(broken['tlsc:k:n']);
assert.ok(n > 1, 'need multiple chunks');
delete broken['tlsc:k:' + (n - 1)];
assert.strictEqual(tlSyncUnpack(broken, 'k'), null);

// 7. 无元数据 / 非法输入 → null
assert.strictEqual(tlSyncUnpack({}, 'k'), null);
assert.strictEqual(tlSyncUnpack(null, 'k'), null);
assert.strictEqual(tlSyncUnpack({ 'tlsc:k:n': 'x' }, 'k'), null);
assert.strictEqual(tlSyncUnpack({ 'tlsc:k:n': '0' }, 'k'), null);

// 8. 键隔离：A 的分片不影响 B
const a = tlSyncPack('a', 'AAA'.repeat(3000));
const b = tlSyncPack('b', 'BBB'.repeat(3000));
assert.strictEqual(tlSyncUnpack(Object.assign({}, a, b), 'a'), 'AAA'.repeat(3000));
assert.strictEqual(tlSyncUnpack(Object.assign({}, a, b), 'b'), 'BBB'.repeat(3000));

console.log('test-sync-chunks OK (8 cases)');
