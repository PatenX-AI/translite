# AMO 上架文案 · 轻译 TransLite v1.4.0

> 提交页：Add-on Developer Hub → Submit a New Add-on → **Listing on AMO** → Describe Add-on
> 中文为主，附英文版；AMO 表单的 Description 字段支持有限 HTML（`<b> <i> <ul> <li> <p> <br> <a>`）。
> 标 `<TODO>` 的字段必须由开发者在提交前补齐。

---

## 1. 表单字段（直接复制）

| 字段 | 填写值 |
|---|---|
| **Name** | `轻译 TransLite` |
| **Add-on URL（slug）** | `translite`（若被占用，改用 `translite-translator`） |
| **Summary（简短描述，中文）** | 网页整页 / 可视区域翻译：微软免密钥、百度与自定义大模型多模型接力；支持指译、双语对照、自动翻译与站点级翻译行为规则。译文原位显示，完全继承原网页样式。 |
| **Summary（English）** | Full-page and viewport translation with Microsoft, Baidu, or your own LLM. Peek translation, bilingual view, auto-translate rules and site-level behavior rules. Results appear in place and inherit the page's original styling. |
| **Categories（最多 2 个）** | `Language Support`（`language-support`）；可选第二项 `Other`（`other`） |
| **Firefox for Android categories** | 不勾选（未针对 Android 适配与测试） |
| **Tags** | `translation`, `translator`, `翻译`, `bilingual`, `llm` |
| **Support email** | `<TODO: 填写支持邮箱>` |
| **Support website** | `https://github.com/PatenX-AI/translite/issues` |
| **Homepage / 项目主页** | `https://github.com/PatenX-AI/translite` |
| **License** | `Mozilla Public License 2.0 (MPL-2.0)` |
| **Privacy policy** | 勾选「有隐私政策」，填 `https://github.com/PatenX-AI/translite/blob/main/store/PRIVACY-POLICY.md` |
| **This add-on is experimental** | 否 |
| **Requires payment / non-free services** | **否**（全部核心功能可用免费微软引擎；自定义大模型 / 百度引擎需用户自行申请并填写 API Key，可能产生第三方费用——已在下方描述与隐私政策中明确披露） |
| **Release notes for this version** | 见 `RELEASE-NOTES.md` |
| **Notes for Reviewers** | 见 `REVIEWER-NOTES.md` |

---

## 2. 详细描述 · 中文

### 轻译 TransLite 是什么

一个面向阅读外文网页的 Firefox 翻译扩展。点击工具栏图标打开主控台，或按 `Alt+A`，即可把当前页面（或仅可视区域）翻译成目标语言。译文**原位显示**，完全继承原网页的字体、颜色与排版，不加底色、不加竖线、不插入额外容器。

### 主要功能

- **三种翻译引擎**：微软免密钥翻译（默认，开箱即用）、百度翻译（需 APPID + 密钥）、OpenAI 兼容大模型（需自填接入点与 Key），支持多模型接力与失败自动降级。
- **翻译范围可控**：默认只翻译可视区域，可提前翻译 1~10 屏；也可一键切换为「完整页面」。
- **显示模式**：仅译文 / 双语对照 / 显示原文；底栏主按钮与双语开关随时切换。
- **指译**：双击某段落持久切换、按住触发键临时预览，两者独立开关、共用一个触发键（CapsLock / Ctrl / Alt / Shift 等 7 选 1）。
- **自动翻译**：「全部站点（按原始语言匹配）」与「自定义站点列表」是两个**独立开关**，可同时开启或全部关闭；全部关闭时按钮与快捷键仍然可用。
- **手动翻译范围**：可选择只对当前页生效，或对整个域名生效（同域其它标签页与新打开的页面也会自动翻译）。
- **提示词模板库**：内置通用 / 科技文献 / 专利翻译模板，可编辑、复制、命名，并支持按站点自动套用（多个站点用 `,` 或 `;` 分隔）。
- **翻译行为规则**：按「站点 + XPath / 正则 + 行为」定义 skip（不翻译）、inline（双语不换行）、trans（仅译文）；内置字母数字混编编号、邮件地址、网址过滤，以及智慧芽专利标题不换行规则。正则按**完整段落匹配**，段内混有正常语句不会误跳过。
- **全局总开关**：关闭后不向页面注入任何代码，自动翻译、按钮、快捷键与指译全部不响应。
- **配置同步与导入导出**：可通过 Firefox Sync 同步配置，也支持 JSON 导出 / 导入 / 重置。

### 关于隐私与数据传输（重要）

翻译时，扩展会把**用户选择翻译的段落文本**发送到所选引擎：默认发送到微软的翻译端点；若用户自行配置了百度或大模型，则发送到用户填写的接入点。扩展**不收集**浏览历史、点击流、搜索词、账号信息，不含统计、广告、崩溃上报或任何遥测。页面 URL 仅在本地用于站点规则与站点提示词匹配，不会作为请求内容发出。

自动翻译的两个开关默认是开启的。若不希望页面加载时自动发送文本，可在主控台关闭这两个开关，或直接关闭全局总开关（关闭后零注入、零网络请求）。完整说明见 `PRIVACY-POLICY.md`。

### 是否需要付费

不需要。默认的微软引擎免密钥、免费使用。自定义大模型与百度引擎属于可选功能，需要用户自行向第三方申请并填写 API Key，第三方可能按其规则收费——这与本扩展无关，也不影响核心功能。

### 开源

源代码、构建脚本与全部上架材料公开在 `https://github.com/PatenX-AI/translite`，许可证 MPL-2.0。扩展不含编译 / 压缩 / 打包步骤，XPI 内的 JavaScript 即源码。

---

## 3. 详细描述 · English

### What it does

TransLite is a Firefox extension for reading pages in foreign languages. Open the toolbar panel or press `Alt+A` to translate the current page (or just the visible area). Translations appear **in place** and inherit the page's original fonts, colors and layout — no highlights, no boxes, no injected containers.

### Key features

- **Three engines**: keyless Microsoft Translator (default, works out of the box), Baidu (requires APPID + key), and any OpenAI-compatible LLM (endpoint + key supplied by the user), with multi-model relay and automatic fallback.
- **Translation scope**: visible area by default (with 1–10 screen look-ahead), or the full page.
- **Display modes**: translated only / bilingual / original; switch from the fixed footer bar.
- **Peek translation**: double-click a paragraph to toggle, or hold a trigger key for a temporary preview. Two independent switches share one trigger key (7 options including CapsLock, Ctrl, Alt, Shift).
- **Auto-translate**: two independent switches — "all sites (by source language)" and "a custom site list". Both can be off; manual button and shortcuts still work.
- **Manual scope**: apply a manual translation to the current page only, or to the whole domain (other tabs and newly opened pages of the same host).
- **Prompt library**: built-in general / technical / patent templates; editable, copyable, nameable, and applicable per site (multiple sites separated by `,` or `;`).
- **Translation behavior rules**: site + XPath or regex + `skip` / `inline` / `trans`. Built-in rules skip alphanumeric IDs, e-mail addresses and URLs, plus a no-line-break rule for patent titles on `*.zhihuiya.com`. Regex rules match **the whole paragraph**, so a sentence containing an e-mail address is still translated.
- **Global master switch**: when off, no code is injected into pages and auto-translate, buttons, shortcuts and peek translation are all disabled.
- **Config sync / import / export**: optional Firefox Sync, plus JSON export, import and reset.

### Privacy and data transmission (important)

When translating, the extension sends **the text of the paragraphs being translated** to the selected engine: by default to Microsoft's translation endpoint, or to a Baidu / LLM endpoint only if the user configured it. It does **not** collect browsing history, click streams, search terms, account data, analytics, ads, crash reports or any telemetry. Page URLs are used locally for site rules and site-specific prompts and are not sent as request content.

Both auto-translate switches are on by default. If you do not want text sent automatically on page load, turn them off in the panel, or turn off the global master switch (zero injection, zero network requests). Full details: `PRIVACY-POLICY.md`.

### Does it require payment?

No. The default Microsoft engine is keyless and free. Baidu and custom LLM engines are optional and require the user's own API key from those third parties, which may charge according to their own terms. This is unrelated to the extension and does not affect core functionality.

### Open source

Source, build scripts and all submission materials are public at `https://github.com/PatenX-AI/translite` under MPL-2.0. There is no build, minification or bundling step — the JavaScript inside the XPI is the source code.

---

## 4. 可直接粘贴的 HTML 版（中文）

```html
<p><b>轻译 TransLite</b> 把外文网页整页或仅可视区域翻译成目标语言，译文原位显示，完全继承原网页样式。</p>
<ul>
  <li><b>三种引擎</b>：微软免密钥（默认，开箱即用）、百度、OpenAI 兼容大模型（需自填 Key），支持多模型接力与失败降级。</li>
  <li><b>范围与模式</b>：可视区域（可提前 1~10 屏）/ 完整页面；仅译文 / 双语对照 / 原文。</li>
  <li><b>指译</b>：双击切换、按住预览，共用一个触发键。</li>
  <li><b>自动翻译</b>：按语言匹配的全部站点与自定义站点两个独立开关，可全部关闭。</li>
  <li><b>提示词模板库</b>：内置模板可编辑、复制、按站点自动套用。</li>
  <li><b>翻译行为规则</b>：站点 + XPath/正则 + skip/inline/trans；正则按完整段落匹配，段内混有正常语句不误跳过。</li>
  <li><b>全局总开关</b>：关闭后零注入，按钮、快捷键、自动翻译、指译全部不响应。</li>
</ul>
<p><b>隐私：</b>仅把待翻译段落文本发送到所选引擎（默认微软）；不收集浏览历史、点击流、搜索词、账号信息，无统计与遥测。自动翻译默认开启，可在主控台关闭或直接关闭总开关。详见本页隐私政策链接。</p>
<p><b>费用：</b>核心功能免费。自定义大模型 / 百度为可选功能，需用户自行申请第三方 API Key，第三方可能收费。</p>
<p>源码与材料：<a href="https://github.com/PatenX-AI/translite">github.com/PatenX-AI/translite</a>（MPL-2.0）。</p>
```
