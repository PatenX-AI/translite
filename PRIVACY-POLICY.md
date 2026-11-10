# 隐私政策 / Privacy Policy — 轻译 TransLite

**适用版本**：v1.4.0　**生效日期**：2026-11-09
**开发者 / Data controller**：PatenX-AI（<https://github.com/PatenX-AI>）
**联系 / Contact**：`<TODO: 填写支持邮箱>`（或使用 <https://github.com/PatenX-AI/translite/issues>）

> 本政策同时以中文和英文提供；两者含义一致。若理解有歧义，以中文版为准。
> This policy is provided in Chinese and English. Both versions have the same meaning; in case of conflict the Chinese version prevails.

---

## 中文版

### 1. 一句话概括

扩展只把**你选择翻译的段落文本**发给你所选的翻译引擎，用于返回译文。除此之外不收集、不上传、不出售任何个人信息；没有账号、没有统计、没有广告、没有遥测，开发者不运营任何接收数据的服务器。

### 2. 会传输什么数据，发给谁

| 数据 | 何时传输 | 接收方 | 用途 |
|---|---|---|---|
| 待翻译段落的**文本内容** | 点击「立即翻译」、按快捷键、启用指译、或自动翻译触发时 | 默认：`edge.microsoft.com`（微软翻译端点）；若你自行配置了百度：`fanyi-api.baidu.com`；若你自行配置了大模型：**你填写的接入点** | 获取译文 |
| 源语言 / 目标语言参数、提示词模板正文 | 同上 | 同上 | 让引擎按指定方式翻译 |
| 你的 APPID / API Key（**仅当你主动填写**） | 仅在使用百度或自定义大模型引擎时 | **仅**发往你填写的那个接入点 | 该服务的鉴权 |

- 页面 URL（地址）**只在扩展内部本地使用**，用于匹配「自定义站点」「站点级提示词」「站点级翻译行为规则」，**不会作为请求内容发送给任何翻译服务**，也不会发给开发者。
- 扩展**不读取**表单输入、密码、Cookie、本地存储、书签、下载记录、搜索词、点击流或浏览历史。
- 不会上传设备标识、IP 归属、使用频次、崩溃日志或任何交互统计。

### 3. 本地存储了什么

| 键 | 内容 | 位置 |
|---|---|---|
| `tl_config_v1` | 界面与翻译设置、模型列表、提示词模板、规则；若你填写了 API Key，也包含该 Key | `browser.storage.local`（仅本机浏览器配置文件内） |
| `tl_cache_v1` | 已翻译段落及译文（避免重复请求） | `browser.storage.local`（仅本机） |
| `tl_fxsync_on` | Firefox Sync 开关状态 | `browser.storage.local`（仅本机） |

这些存储**不会**被开发者读取。你可以在设置页清空缓存、导出 / 导入 / 重置配置；卸载扩展时浏览器会一并删除这些数据。

### 4. Firefox Sync（可选，默认关闭）

若你在设置页主动开启 Firefox 账号同步，`tl_config_v1` 会被分片同步到 Mozilla 的 Sync 服务，以便在你的设备间共享设置。若该配置中含 API Key，Key 也会随之同步，此部分由 **Mozilla 的隐私政策**管辖。不开启同步则完全不经过 Sync。同步数据不含翻译缓存、不含页面内容。

### 5. 你如何控制

- **全局总开关**（主控台右上角）：关闭后扩展不再向任何页面注入代码，自动翻译、按钮、快捷键、指译全部不响应，**不会产生翻译请求**。
- **两个独立自动翻译开关**：可分别关闭「全部站点（语言匹配）」与「自定义站点」。全部关闭后，只有你主动点击按钮 / 快捷键 / 指译时才会发送文本。
- **翻译范围**：可选「可视区域」或「完整页面」，直接决定哪些段落会被发送。
- **翻译行为规则**：可设置 skip 规则，让编号、邮件、网址或任意自定义内容根本不进入翻译队列。
- **缓存**：设置页可一键清空。
- **引擎选择**：不填写任何 Key 时，只有免费的微软引擎可用；填写第三方 Key 前请自行阅读该第三方的隐私政策。

> 注意：为了让首次安装即可使用，两个自动翻译开关默认是**开启**的。若不希望页面加载时自动发送文本，请在安装后从工具栏面板关闭它们，或直接关闭全局总开关。

### 6. 第三方服务

扩展本身不捆绑任何第三方运行时库、不加载远程脚本、不使用 CDN。翻译请求直接由扩展的后台脚本发往下列端点之一，其数据处理遵循各自服务方的政策：

- Microsoft Translator（默认，免密钥）
- 百度翻译开放平台（可选）
- 用户自行填写的 OpenAI 兼容大模型接入点（可选，例如智谱、DeepSeek、阿里云百炼、OpenAI、Google Gemini、小米 MiMo 或任意自建端点）

开发者与上述服务无数据回传关系，也不接收任何译文副本。

### 7. 清单中的数据收集声明

依据 Firefox 自 2025-11-03 起对新扩展的要求，`manifest.json` 声明：

- `required: ["websiteContent"]` — 页面正文内容（翻译功能所必需）
- `optional: ["authenticationInfo"]` — 用户自行填写的第三方 API Key（仅可选引擎使用）

Firefox 140+ 会在安装时展示这些声明；对更早版本，上述开关提供安装后立即可用的控制方式。

### 8. 儿童、保留期限与变更

本扩展不面向 13 岁以下儿童，也不主动收集年龄信息。所有数据仅保存在你的浏览器本地，由你自行删除；开发者无保留期限。政策变更会在仓库与本文件更新，并递增扩展版本号。

---

## English version

### 1. Summary

The extension sends **only the text of paragraphs you choose to translate** to the translation engine you selected, in order to receive the translation. It does not collect, upload, sell, or share any other personal information. There are no accounts, analytics, ads, telemetry, or developer-operated servers receiving data.

### 2. What is transmitted and to whom

| Data | When | Recipient | Purpose |
|---|---|---|---|
| **Text of paragraphs to translate** | On clicking Translate, using the shortcut, peek translation, or auto-translate | By default `edge.microsoft.com` (Microsoft Translator); Baidu at `fanyi-api.baidu.com` if configured; **the endpoint you entered** for a custom LLM | Obtain translations |
| Source/target language parameters, prompt template text | Same as above | Same as above | Instruct the engine |
| Your APPID / API key (**only if you entered one**) | Only when Baidu or a custom LLM engine is used | **Only** to the endpoint you configured | Authentication for that service |

- Page URLs are used **locally inside the extension only**, for custom-site rules, site-specific prompts and site-level behavior rules. They are **not** sent to any translation service or to the developer.
- The extension does **not** read form inputs, passwords, cookies, localStorage, bookmarks, downloads, search terms, click streams, or browsing history.
- No device identifiers, IP-derived data, usage frequency, crash logs or interaction statistics are uploaded.

### 3. What is stored locally

| Key | Contents | Location |
|---|---|---|
| `tl_config_v1` | Settings, model list, prompt templates, rules; your API key if you entered one | `browser.storage.local` (your browser profile only) |
| `tl_cache_v1` | Translated paragraphs and results (to avoid repeat requests) | `browser.storage.local` (local only) |
| `tl_fxsync_on` | Firefox Sync toggle state | `browser.storage.local` (local only) |

The developer cannot read this storage. You can clear the cache and export / import / reset settings from the options panel; uninstalling the extension removes the data.

### 4. Firefox Sync (optional, off by default)

If you explicitly enable Firefox account sync in settings, `tl_config_v1` is chunked and synced through Mozilla's Sync service to share settings across your devices. If that config contains API keys, those keys are synced too; this part is governed by **Mozilla's privacy policy**. Translation cache and page content are never synced.

### 5. Your controls

- **Global master switch** (top-right of the panel): when off, no code is injected into pages and no translation request is made.
- **Two independent auto-translate switches**: disable "all sites (by language)" and "custom site list" separately; with both off, text is sent only when you explicitly translate.
- **Translation scope**: visible area or full page — directly controls which paragraphs are sent.
- **Behavior rules**: `skip` rules keep IDs, e-mails, URLs or any custom pattern out of the queue entirely.
- **Cache**: clear it in one click from settings.
- **Engine choice**: without any key, only the free Microsoft engine is available; review the third party's privacy policy before entering a key.

> Both auto-translate switches are **on by default** so the extension works immediately after installation. If you do not want text sent automatically on page load, turn them off in the toolbar panel, or switch off the global master switch.

### 6. Third parties

No third-party runtime libraries, remote scripts or CDNs are bundled. Translation requests are issued directly from the extension's background script to one of: Microsoft Translator (default, keyless), Baidu Translate (optional), or a user-configured OpenAI-compatible endpoint (optional, e.g. Zhipu, DeepSeek, Alibaba DashScope, OpenAI, Google Gemini, Xiaomi MiMo, or any self-hosted endpoint). The developer receives no copies of translations.

### 7. Manifest data-collection declaration

As required for new Firefox extensions since 2025-11-03, `manifest.json` declares:

- `required: ["websiteContent"]` — website text content (essential to translation)
- `optional: ["authenticationInfo"]` — third-party API keys the user may enter (optional engines only)

Firefox 140+ shows these at install time; on earlier versions the switches described above provide immediately available post-install control.

### 8. Children, retention, changes

Not directed at children under 13; no age data is collected. All data stays in your browser and is deleted by you; the developer retains nothing. Policy changes are published in the repository with an incremented extension version.
