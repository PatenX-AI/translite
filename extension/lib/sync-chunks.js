/* ============ lib/sync-chunks.js — storage.sync 分片（纯函数，可 node 单测） ============ */
/* Firefox storage.sync 单项配额约 8KB，长配置 JSON 按 UTF-8 字节数切片存储：
 *   tlsc:<key>:n  = 片数
 *   tlsc:<key>:i  = 第 i 片（0 起）
 * 仅用于 tl_config_v1 配置同步；翻译缓存只存 storage.local。
 */
const TL_SYNC_CHUNK_BYTES = 6000;

function tlSyncPack(key, str) {
  const s = String(str);
  const enc = new TextEncoder();
  const chunks = [];
  let cur = '', curB = 0;
  for (const ch of s) {
    const b = enc.encode(ch).length;
    if (curB + b > TL_SYNC_CHUNK_BYTES && cur) {
      chunks.push(cur); cur = ''; curB = 0;
    }
    cur += ch; curB += b;
  }
  chunks.push(cur);
  const items = {};
  items['tlsc:' + key + ':n'] = String(chunks.length);
  chunks.forEach((c, i) => { items['tlsc:' + key + ':' + i] = c; });
  return items;
}

function tlSyncUnpack(items, key) {
  if (!items || typeof items !== 'object') return null;
  const count = Number(items['tlsc:' + key + ':n']);
  if (!Number.isInteger(count) || count < 1) return null;
  let out = '';
  for (let i = 0; i < count; i++) {
    const part = items['tlsc:' + key + ':' + i];
    if (typeof part !== 'string') return null;
    out += part;
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tlSyncPack, tlSyncUnpack, TL_SYNC_CHUNK_BYTES };
}
