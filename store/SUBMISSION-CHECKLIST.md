# AMO 提交检查清单 · 轻译 TransLite v1.4.0

> 按顺序执行；每完成一项打勾。**标 ⚠️ 的是必须由开发者本人补齐 / 决策的项目。**

## A. 提交前（本地已完成）

- [x] `extension/manifest.json`：MV3、`gecko.id = translite@patenx.app`、`strict_min_version = 115.0`、
      `gecko_android.strict_min_version = 142.0`、图标 5 尺寸、`commands`。
- [x] **强制数据声明**：`data_collection_permissions.required = ["websiteContent"]`、
      `optional = ["authenticationInfo"]`（2025-11-03 起新扩展必填，缺失会被拒绝提交）。
- [x] `web-ext lint` 对**实际 XPI 内容**：`0 errors / 3 warnings / 0 notices`，告警已在
      `REVIEWER-NOTES.md` 第 5 节逐条解释。
- [x] `python scripts/build-xpi.py --source-zip`：生成 `dist/translite-1.4.0.xpi`（13 个白名单文件）
      与 `store/translite-1.4.0-source.zip`。
- [x] XPI 结构校验：manifest 在根、路径安全、清单与白名单完全一致、SHA-256 记录。
- [x] 全量回归：语法 / `test-core` 17 组 / `test-segments` 19/19 / `test-sync-chunks` 8/8 /
      `test-background` / `test-gate` / `verify-popup` / `verify-ext2` 全通过。
- [x] 图标：阿里妈妈方圆体 VF SemiBold，`scripts/gen-icons.py` 可复现；字体文件不随仓库分发。
- [x] 资料：`LISTING.md`、`PRIVACY-POLICY.md`、`REVIEWER-NOTES.md`、`RELEASE-NOTES.md`、
      `test-page.html`、`screenshots/`。

## B. ⚠️ 开发者需补齐

- [ ] **支持邮箱**：把 `<TODO: 填写支持邮箱>` 替换为真实邮箱（出现在 `LISTING.md`、
      `PRIVACY-POLICY.md`、`REVIEWER-NOTES.md`、`store/README.md`）。
      AMO 表单的 Support email 必填。
- [ ] **AMO 开发者账号**：用 Mozilla Account 登录 <https://addons.mozilla.org/developers/>，
      同意 Developer Agreement，建议开启两步验证。
- [ ] **决定默认自动翻译开关**：两个开关默认开启（安装后即可用），已在描述与隐私政策披露。
      若希望更保守，可把 `core.js` 的 `DEFAULTS.autoAll / autoSiteOn` 改为 `false` 后重新打包
      —— 这会改变产品默认行为，需自行权衡。
- [ ] **确认扩展 ID 未被占用**：首次签名时 AMO 会校验 `translite@patenx.app` 唯一性。

## C. 提交流程（AMO 后台）

1. 进入 Developer Hub → **Submit a New Add-on** → 选择 **On this site（Listing on AMO）**。
2. **Upload Version**：上传 `dist/translite-1.4.0.xpi`（未签名即可，AMO 会校验并签名）。
   确认校验结果是「0 errors」；3 条 warnings 可继续，审核说明里已解释。
3. **平台兼容**：勾选 Firefox 桌面版；**不勾选** Firefox for Android 分类。
4. **源码**：问「Do you need to provide source code?」选 **No**（无编译 / 压缩 / 生成代码）。
   若被要求，上传 `store/translite-1.4.0-source.zip` 并附 `REVIEWER-NOTES.md` 第 4 节的构建命令。
5. **Describe Add-on**：按 `LISTING.md` 第 1 节逐字段填写。
   - Name `轻译 TransLite`、slug `translite`
   - Summary / Description 复制第 1、2、4 节（中文 + HTML 版）
   - Categories：`Language Support`（可选 `Other`）；Android 分类留空
   - Support email ⚠️、Support website `https://github.com/PatenX-AI/translite/issues`
   - License `MPL-2.0`
   - Experimental = 否；Requires payment = 否
6. **Privacy policy**：勾选「有隐私政策」，填
   `https://github.com/PatenX-AI/translite/blob/main/store/PRIVACY-POLICY.md`
   （⚠️ 需先把代码推送到 GitHub，确保链接可公开访问）。
7. **Screenshots / Promo**：上传 `store/screenshots/` 中的 4 张 1280×800 截图；
   可选上传 700×280 推广图。
8. **Release notes**：粘贴 `RELEASE-NOTES.md` 的「主要功能 + v1.4.0 改动」段落。
9. **Notes for Reviewers**：粘贴 `REVIEWER-NOTES.md` 全文（权限理由、数据声明、测试步骤、告警解释）。
10. 点击 **Submit Version**，保存邮件确认。之后可能进入人工审核，按审核员提问及时回复。

## D. 提交后

- [ ] 记录 AMO 分配的版本页面 URL / GUID，写入仓库 `store/README.md`。
- [ ] 审核通过后，把签名版 XPI 也附加到 GitHub Release（可选）。
- [ ] 后续版本必须**沿用 `data_collection_permissions`**（一旦启用，之后所有版本都要保留）。
- [ ] 若审核员要求收紧默认自动翻译，按 B 项改默认值并**只提交与反馈相关的改动**。

## E. 常见拒绝原因对照

| 风险点 | 本包的处理 |
|---|---|
| 缺 `data_collection_permissions` | 已补齐并在审核说明中解释 |
| 宽泛 `<all_urls>` 无理由 | 第 2 节逐项权限理由 + 总闸零注入机制 |
| 未披露数据传输 | 详细描述、隐私政策、审核说明三处一致披露 |
| 远程代码 / eval / 内联脚本 | 全部排除，XPI 内即源码 |
| 混淆或生成代码无源码包 | 无混淆；另附可复现源码包与构建脚本 |
| 默认自动传输被视为「意外行为」 | 明确披露 + 立即可用的控制入口；B 项留有更保守的开关 |
