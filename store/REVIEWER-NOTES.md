# Notes for Reviewers · 轻译 TransLite v1.4.0

**Add-on ID**: `translite@patenx.app`　**Manifest**: MV3　**Min Firefox**: 115.0
**Source**: <https://github.com/PatenX-AI/translite>　**License**: MPL-2.0
**Package**: `dist/translite-1.4.0.xpi`　**Source archive**: `store/translite-1.4.0-source.zip`

---

## 1. 功能与验证步骤

建议用仓库中的 `store/test-page.html`（纯英文段落，无调试标记）验证；也可用任意英文网页。

1. 在 `about:debugging#/runtime/this-firefox` 选择「Load Temporary Add-on」并选 `manifest.json`，
   或直接安装 `translite-1.4.0.xpi`。
2. 打开 `store/test-page.html`（或任意英文页面）。默认两个自动翻译开关开启，页面加载后应自动出现中文译文。
3. 点击工具栏「译」图标 → 主控台「翻译」页：
   - 底栏主按钮在「立即翻译本页 / 立即翻译 / 显示原文」之间切换；
   - 「双语」开关切换双语对照；
   - 「翻译范围」可在「可视区域 / 完整页面」间切换。
4. 快捷键 `Alt+A` 翻译 / 显示原文，`Alt+Shift+A` 切换双语。
5. 「模型」页：模型列表、调用控制、段落合并、提示词模板库（可编辑 / 复制 / 删除 / 按站点套用）。
6. 「设置」页 → 「翻译行为」：可命名规则、选 XPath 或正则、设 skip / inline / trans、按站点限定；
   内置「字母数字混编编号 / 邮件地址 / 网址 / 智慧芽专利标题」四条规则可直接验证。
7. **总闸验证**：关闭主控台右上角「全局开关」→ 页面上的译文还原为原文、`about:debugging` 中不再有内容脚本注入；
   此时按钮、快捷键、指译、自动翻译均不响应；重新开启后已打开的页面会被唤醒并恢复。
8. **指译**：设置页启用「双击切换」或「按住预览」，选一个触发键（默认 CapsLock），
   在段落上双击 / 按住即可临时查看译文。

**无需账号、无需测试凭据**；全部核心功能使用免密钥的微软翻译端点。百度与自定义大模型为可选功能，
需要审核员自行准备第三方 Key（不提供也不影响功能验证）。

---

## 2. 权限理由（逐项）

| 权限 | 为什么必需 | 具体使用位置 |
|---|---|---|
| `storage` | 保存用户配置（`tl_config_v1`）与翻译缓存（`tl_cache_v1`），避免同一段落重复请求；可选 Firefox Sync 分片同步配置 | `background.js` 的 `ConfigHub` / `Cache` / `Sync` |
| `tabs` | 查询当前标签页以驱动 popup 状态、按 tab 维护 badge 三态、向同域标签广播「域名范围」自动翻译、读取 tab URL 用于站点规则匹配 | `browser.tabs.query({active:true,currentWindow:true})`、`tabs.sendMessage`、`applyBadge` |
| `scripting` | **实现全局总闸**：manifest 中刻意**没有**静态 `content_scripts`。开启时用 `registerContentScripts()` 动态注册 `lib/core.js` + `content.js`；关闭时 `unregisterContentScripts()` 并广播 `destroy`，实现「关闭后零注入」。重新开启时对已打开页面执行 `ping` / `revive` / `executeScript()` 唤醒 | `ContentGate`（`background.js`） |
| `host_permissions: <all_urls>` | 用户可能在任意网站触发翻译；内容脚本与后台请求需要在任意主机上工作。这是翻译类扩展的核心能力 | `browser.scripting.registerContentScripts({ matches: ['<all_urls>'] })`、`tabs.sendMessage` |
| `commands` | `Alt+A` 翻译 / 显示原文、`Alt+Shift+A` 切换双语 | `manifest.json` → `commands` |

**未申请**：`webRequest`、`webRequestBlocking`、`cookies`、`history`、`bookmarks`、`downloads`、
`notifications`、`identity`、`activeTab` 之外的其它权限。不读取表单输入、密码、Cookie、本地存储或浏览历史。

**最小化措施**：总闸关闭时注销所有 content script、清空 tab 状态、移除页面上的 `data-tl-*` 标记与注入样式；
页面内**无 UI、无浮动按钮**，不注入捕获型监听器；所有注入的 CSS 仅用于译文布局且在总闸关闭时移除。

---

## 3. 数据收集与传输声明

`manifest.json` 按 2025-11-03 起对新扩展的强制要求声明：

```json
"data_collection_permissions": {
  "required": ["websiteContent"],
  "optional": ["authenticationInfo"]
}
```

- `websiteContent`（必需）：翻译时把**待翻译段落文本**发往所选引擎。默认 `https://edge.microsoft.com/translate/translatetext`（免密钥）；
  可选 `https://fanyi-api.baidu.com/api/trans/vip/translate`（用户填 APPID/Key）；可选用户自填的 OpenAI 兼容接入点。
- `authenticationInfo`（可选）：仅当用户主动填写第三方 API Key 时存在，且**只发往用户自己填写的那个接入点**。
- 页面 URL 仅在扩展内部用于站点规则 / 站点提示词匹配，**不作为请求内容发送**。
- **无**统计、遥测、广告、崩溃上报、账号体系、开发者服务器、远程脚本或 CDN。
- 完整披露见 `store/PRIVACY-POLICY.md`（AMO 表单中填写其 GitHub 公开链接）。

**关于 Firefox < 140**：`strict_min_version` 保持 115.0 以覆盖 ESR 用户，这些版本没有内建数据同意界面。
按 Mozilla 要求，扩展在安装后提供立即可用的控制入口：主控台右上角**全局总闸**（关闭后零注入、零请求），
以及**两个独立自动翻译开关**（可全部关闭，此后仅用户主动操作才发送文本）。设置页还可清空缓存、导出/导入/重置配置。

> 提示：两个自动翻译开关默认开启，以便安装后即可使用；该行为已在上架详细描述与隐私政策中明确披露（No Surprises）。

---

## 4. 源码与可复现构建

**无需提交源码包**（AMO 表单「Do you need to provide source code?」选 **No**）：
本扩展**没有编译、转译、压缩、混淆或打包步骤**，XPI 内的 `.js` / `.html` / `.css` 就是可直接审阅的源码，
`manifest.json` 按序载入 `lib/sync-chunks.js`、`lib/core.js`、`background.js`；popup 用两个外部 `<script>` 标签。
运行时不含第三方库、不含生成代码、不含远程代码。

为方便审阅，仍随资料包提供 `store/translite-1.4.0-source.zip`（同样的源码 + 构建脚本 + README + 隐私政策 + 审核说明）。

**可复现命令**（在仓库根目录，Python 3 + Pillow 仅用于图标生成；XPI 打包零依赖）：

```bash
python scripts/build-xpi.py --source-zip     # 生成 dist/translite-<version>.xpi 与源码包
python scripts/build-xpi.py --verify dist/translite-1.4.0.xpi
python scripts/gen-icons.py                  # 重新生成 16/32/48/96/128 PNG（需本机已安装字体）
python scripts/gen-icons.py --check          # 只校验图标尺寸与铺满度
npx web-ext lint --source-dir ./extension    # 校验清单（对 XPI 内容 lint 为 0 errors）
```

- `scripts/build-xpi.py` 采用白名单（13 个文件）与固定时间戳，同一源码产出字节一致的 XPI；
  测试页 `extension/ext2-test-page.html`、截图、设计文档一律**不进 XPI**。
- `scripts/gen-icons.py` 用阿里妈妈方圆体 VF（`wght=600` SemiBold）在 1024×1024 母版超分渲染后分级 LANCZOS 降采样。
  **字体文件不随仓库分发**（该字体为阿里妈妈免费字体，允许商用与嵌入式使用，但不允许再分发 / 二次创作 / 商标注册）；
  脚本只读取使用者本机已安装的字体，运行时不加载任何字体文件。
- 其余测试脚本（node 单测与 playwright 烟测）不进入 XPI，也不进入发行版。

---

## 5. 已知校验告警及说明

对**实际 XPI 内容**（排除测试页）运行 `web-ext lint`：`errors = 0`，`warnings = 3`，`notices = 0`。

| 告警 | 说明 |
|---|---|
| `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION`（manifest.json） | `strict_min_version = 115.0` 早于 `data_collection_permissions` 被支持的 140。该键在旧版 Firefox 上会被安全忽略；已按 Mozilla 要求提供安装后立即可用的数据控制入口（见第 3 节）。为覆盖 ESR 用户而**有意保留**。Android 侧已单独设 `gecko_android.strict_min_version = 142.0`。 |
| `UNSAFE_VAR_ASSIGNMENT`（popup/popup.js:316、:534） | 两处是**静态 UI 骨架标记**（模型行、规则行），不含任何用户可控字符串；所有动态值在赋值后通过 `textContent` / `classList` / `new Option()` 设置。所有下拉选项已改为 DOM API 构建，不再用字符串拼接 innerHTML。 |

无 `eval` / `new Function` / 内联 `<script>` / 远程脚本 / `document.write`。

---

## 6. 其它

- **Android**：未针对 Firefox for Android 做适配与测试，AMO 表单不勾选 Android 分类；manifest 中 `gecko_android.strict_min_version = 142.0`。
- **第三方资源**：运行时零依赖；图标字体仅构建期使用且不分发；无 CDN、无远程脚本。
- **可选付费功能**：百度与自定义大模型引擎需用户自己的第三方 Key，第三方可能收费；核心功能（微软引擎）完全免费，
  因此表单「requires payment」选 **No**，但已在描述与隐私政策中披露。
- **联系**：`<TODO: 填写支持邮箱>` 或 <https://github.com/PatenX-AI/translite/issues>。
