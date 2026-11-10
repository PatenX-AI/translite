# 轻译 TransLite v1.4.0 · 发行说明

**发布日期**：2026-11-09　**扩展 ID**：`translite@patenx.app`　**许可证**：MPL-2.0
**下载**：`translite-1.4.0.xpi`（本 Release 资产）　**源码**：<https://github.com/PatenX-AI/translite>

这是面向 Firefox 的**首个公开发行版**。XPI 为未签名包，可直接通过
`about:debugging → Load Temporary Add-on` 临时安装；正式分发由 Firefox 扩展中心签名。

## 主要功能

- **三种翻译引擎**：微软免密钥翻译（默认，开箱即用）、百度翻译（APPID + 密钥）、
  OpenAI 兼容大模型（自填接入点 / Key），支持多模型接力、连败降级与恢复回切。
- **翻译范围**：可视区域（可提前 1~10 屏）/ 完整页面；常规翻译同样遵守范围。
- **显示模式**：仅译文 / 双语对照 / 原文；底栏主按钮与双语开关随时切换。
- **指译**：双击持久切换 + 按住临时预览，两个独立开关共用一个触发键（7 选 1）。
- **自动翻译**：「全部站点（原始语言匹配）」与「自定义站点」两个独立开关，可全部关闭。
- **手动翻译范围**：当前页 / 当前域名（同域其它标签页与新页面同步生效）。
- **提示词模板库**：内置通用 / 科技文献 / 专利模板，可编辑、命名、复制、删除；
  支持按站点自动套用（多个站点用 `,` 或 `;` 分隔，精确站点优先）。
- **翻译行为规则**：一条规则 = 名称 + 站点 + XPath 或正则 + 行为（skip / inline / trans）。
  内置字母数字混编编号、邮件地址、网址过滤与智慧芽专利标题不换行规则；
  正则按**完整段落匹配**（`sen a email to lily@gmail.com` 这类含正常语句的段落仍会翻译）。
- **全局总开关**：关闭后不注入任何代码，按钮、快捷键、自动翻译与指译全部不响应。
- **配置同步**：可选 Firefox Sync（分片 ≤6000B），支持 JSON 导出 / 导入 / 重置与缓存清理。

## v1.4.0 相对上一内部版本

- 规则行改用与模型列表一致的开关 / 删除样式；新增规则改为插入同结构空白草稿行。
- 规则增加命名；正则输入框两侧固定显示 `^` / `$`，提供模板下拉一键填入并自动剥离粘贴的锚点。
- 正则类行为放开 `inline` / `trans`（此前仅 `skip`），与 XPath 规则等价打标。
- 内置提示词实体化进模板库，允许编辑（名称 / 正文 / 适用站点），仅不可删除。
- 站点规则支持多站点；「＋ 新建模板」直接带入当前生效模板（含站点），不再逐行「以此新建」。
- 工具栏图标改用**阿里妈妈方圆体 VF SemiBold**：1024×1024 母版 ×16 超分、
  分级 LANCZOS 降采样、小尺寸光学补偿，解决扩展列表中的锯齿与模糊。
- 上架合规：补齐 `data_collection_permissions`、Android 最低版本声明；
  下拉项改用 DOM API 构建；对 XPI 内容 `web-ext lint` 为 **0 errors**。

## 安装

1. 下载本 Release 的 `translite-1.4.0.xpi`。
2. Firefox 打开 `about:debugging#/runtime/this-firefox` → 「Load Temporary Add-on」→ 选择该 XPI。
3. 点击工具栏「译」图标打开主控台；默认两个自动翻译开关开启，可在面板中随时关闭。

> 临时安装的扩展在浏览器重启后会失效；正式长期使用请等待 Firefox 扩展中心（AMO）审核通过后的签名版本。

## 校验

| 项 | 值 |
|---|---|
| 文件 | `dist/translite-1.4.0.xpi` |
| SHA-256 | 见 `store/README.md` 所在资料包或执行 `python scripts/build-xpi.py --verify <xpi>` |
| `web-ext lint`（XPI 内容） | 0 errors / 3 warnings（已在审核说明中逐条解释） |
| 测试 | `test-core` 17 组、`test-segments` 19/19、`test-sync-chunks` 8/8、`test-background`、`test-gate`、`verify-popup`、`verify-ext2` 全通过 |

## 已知限制

- 未针对 Firefox for Android 适配与测试。
- 百度与自定义大模型引擎需用户自行申请第三方 Key，第三方可能收费。
- 微软免费端点由第三方提供，其可用性与速率不受本项目控制。
