# Firefox 扩展中心（AMO）上架资料包

**适用版本**：轻译 TransLite `v1.4.0` · 扩展 ID `translite@patenx.app`
**仓库**：<https://github.com/PatenX-AI/translite>
**生成日期**：2026-11-09

本目录是提交到 <https://addons.mozilla.org/developers/> 所需的全部公开材料。
不含任何本机绝对路径、账号、密钥、用户数据或调试信息；可以随公开仓库分发。

## 文件索引

| 文件 | 用途 | 提交时怎么用 |
|---|---|---|
| `LISTING.md` | 上架文案（名称 / 简介 / 详细描述 / 分类 / 标签 / 联系信息，中英双语） | 复制到 AMO「Describe Add-on」表单 |
| `PRIVACY-POLICY.md` | 隐私政策（中英双语） | 勾选「有隐私政策」，填仓库中的公开链接 |
| `REVIEWER-NOTES.md` | 审核说明（权限理由、数据收集声明、测试步骤、源码与构建说明、已知 lint 告警解释） | 粘贴到「Notes for Reviewers」 |
| `RELEASE-NOTES.md` | v1.4.0 版本说明 | 填「Release notes for this version」；同时用于 GitHub Release |
| `SUBMISSION-CHECKLIST.md` | 逐项提交清单与待办（含支持邮箱占位） | 提交时逐项核对 |
| `test-page.html` | 供审核员做功能验证的干净测试页（纯英文段落，无调试标记） | 在审核说明中给出链接或作为源码包附件 |
| `screenshots/` | AMO 规格展示截图（1280×800）与推广图（700×280） | 上传到 AMO 的 Screenshots / Promo tile |
| `translite-1.4.0-source.zip` | 源码包（虽然本扩展无编译步骤，仍提供以便审阅） | 若被询问源码，上传此包 |

**发行版 XPI**：`../dist/translite-1.4.0.xpi`（项目根目录的 `dist/`）

## 提交前必须补齐的 2 项

1. **支持邮箱**：`LISTING.md` 与 `SUBMISSION-CHECKLIST.md` 中的 `<TODO: 填写支持邮箱>`。
2. **隐私政策链接**：代码推送后使用
   `https://github.com/PatenX-AI/translite/blob/main/store/PRIVACY-POLICY.md`。

## 一句话流程

`web-ext lint`（0 errors）→ 上传 `dist/translite-1.4.0.xpi` → 选平台 → 填 `LISTING.md`
→ 勾隐私政策并填链接 → 粘贴 `REVIEWER-NOTES.md` → 上传截图 → 提交。

## 重要合规决定（已写入 `REVIEWER-NOTES.md`）

- `browser_specific_settings.gecko.data_collection_permissions`：**自 2025-11-03 起新扩展必填**，
  本扩展声明 `required: ["websiteContent"]`（页面文本发往翻译服务）、
  `optional: ["authenticationInfo"]`（用户自填的第三方 API Key）。
- 保持 `strict_min_version = 115.0` 以覆盖 ESR 用户；Firefox < 140 无内建数据同意界面，
  由**工具栏全局开关 + 两个独立自动翻译开关**提供安装后立即可用的控制入口。
- 无远程代码、无 `eval` / `new Function`、无内联脚本、无第三方运行时库；
  XPI 内 JS 即源码，无编译 / 压缩 / 打包步骤。
- 图标字体「阿里妈妈方圆体 VF」只在构建期用于栅格化，字体文件不随仓库分发、运行时不加载。
