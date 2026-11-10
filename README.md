# 轻译 TransLite

轻量、可自定义的 Firefox 网页翻译扩展。译文**原位显示**，完全继承原网页的字体、颜色与排版，不加底色、不加竖线、不插入额外容器。

- **仓库**：<https://github.com/PatenX-AI/translite>
- **许可证**：[MPL-2.0](LICENSE)
- **当前版本**：`v1.4.0`（扩展 ID `translite@patenx.app`）
- **隐私政策**：[store/PRIVACY-POLICY.md](store/PRIVACY-POLICY.md)

> 本仓库按「仅必要源码 + 发行版」组织，不含内部设计文档、UI 原型、截图、历史归档或任何本机绑定内容。

---

## 功能

| 能力 | 说明 |
|---|---|
| 翻译引擎 | 微软免密钥（默认）、百度（APPID + 密钥）、OpenAI 兼容大模型；多模型接力与失败降级 |
| 翻译范围 | 可视区域（可提前 1~10 屏）/ 完整页面；常规翻译同样遵守 |
| 显示模式 | 仅译文 / 双语对照 / 原文；底栏主按钮与双语开关随时切换 |
| 指译 | 双击持久切换 + 按住临时预览，两个独立开关共用一个触发键 |
| 自动翻译 | 「全部站点（原始语言匹配）」与「自定义站点」两个独立开关，可全部关闭 |
| 手动范围 | 当前页 / 当前域名（同域其它标签页与新页面同步生效） |
| 提示词模板 | 内置通用 / 科技文献 / 专利模板，可编辑、命名、复制，按站点自动套用 |
| 翻译行为规则 | 名称 + 站点 + XPath / 正则 + `skip` / `inline` / `trans`；正则按完整段落匹配 |
| 全局总闸 | 关闭后不注入任何代码，按钮、快捷键、自动翻译与指译全部不响应 |
| 配置同步 | 可选 Firefox Sync（分片 ≤6000B），支持 JSON 导出 / 导入 / 重置 |

扩展不会收集浏览历史、点击流、搜索词、账号信息，不含统计、广告、崩溃上报或遥测。翻译时只把待翻译段落文本发送到所选引擎。详见[隐私政策](store/PRIVACY-POLICY.md)。

---

## 安装

**正式版**：等待 Firefox 扩展中心（AMO）审核通过后安装签名版。

**临时试装**（当前 Release 的 XPI）：

1. 从 [Releases](https://github.com/PatenX-AI/translite/releases) 下载 `translite-1.4.0.xpi`；
2. Firefox 打开 `about:debugging#/runtime/this-firefox`；
3. 点「Load Temporary Add-on」并选择该 XPI；
4. 点工具栏「译」图标打开主控台。

临时安装的扩展在浏览器重启后失效。也可用本仓库源码直接加载 `extension/manifest.json`。

---

## 目录结构

```
extension/                 Firefox 扩展本体（XPI 内容）
  manifest.json            MV3 清单 · gecko.id · 数据收集声明
  background.js            唯一中枢：配置 / 缓存 / 引擎 / badge / 动态注入
  content.js               页面执行器：分段 / 渲染 / 队列 / 指译
  lib/core.js              纯逻辑（可被 Node 直接 require）
  lib/sync-chunks.js       Firefox Sync 分片纯函数
  popup/                   工具栏主控台（HTML / CSS / JS）
  icons/                   16/32/48/96/128 PNG
scripts/
  build-xpi.py             可复现 XPI 打包 + 结构校验
  gen-icons.py             图标生成（需本机安装阿里妈妈方圆体 VF）
store/                     AMO 上架资料（文案 / 隐私政策 / 审核说明 / 检查清单 / 测试页）
test-*.js                  纯 Node 单元测试（assert，无外部依赖）
dist/translite-1.4.0.xpi   发行版
```

设计要点：`background.js` 是唯一中枢，`content.js` 在页面内零 UI（不注入悬浮按钮、不注入捕获监听器），工具栏 popup 是唯一交互入口。总闸开启时用 `browser.scripting` 动态注册内容脚本，关闭时注销并向已打开页面广播销毁，实现「关闭后零注入」。

---

## 构建与打包

需要 **Python 3**（打包零第三方依赖）；图标生成另需 **Pillow** 与本机字体。

```bash
# 生成 XPI 与 AMO 源码包，并校验结构
python scripts/build-xpi.py --source-zip

# 只校验已有 XPI
python scripts/build-xpi.py --verify dist/translite-1.4.0.xpi

# 校验图标尺寸 / 铺满度
python scripts/gen-icons.py --check

# 重新生成图标（需本机已安装字体）
python scripts/gen-icons.py
python scripts/gen-icons.py --font /path/to/AlimamaFangYuanTiVF.ttf

# Firefox 扩展校验
npx web-ext lint --source-dir ./extension
```

`build-xpi.py` 使用固定时间戳与白名单（13 个文件），同一份源码产出字节一致的 XPI；测试页、截图、设计文档一律不进包。XPI 内的 JS 即源码，**没有编译、压缩、混淆或打包步骤**。

**关于图标字体**：使用「阿里妈妈方圆体 VF」的 `wght=600`（SemiBold）在 1024×1024 母版超分渲染后分级 LANCZOS 降采样。该字体为阿里妈妈免费字体，允许免费商用与嵌入式使用，但不允许再分发 / 二次创作 / 商标注册，因此**字体文件不随本仓库分发**，运行时也不加载。请从 [iconfont 官方页](https://www.iconfont.cn/fonts/detail?cnid=pOvFIr086ADR) 下载安装后再运行 `gen-icons.py`。

---

## 测试

```bash
node test-core.js           # 纯逻辑：迁移 / 过滤 / 接力 / 规则 / 提示词
node test-sync-chunks.js    # Firefox Sync 分片
node test-background.js     # background 集成（引擎 / 缓存 / badge）
node test-gate.js           # 总闸动态注册与域名范围
node test-segments.js       # 分段策略
```

浏览器 UI 烟测脚本未随公开仓库分发；AMO 审核用的功能验证页见 [`store/test-page.html`](store/test-page.html)。

---

## 上架与发布

AMO 提交所需的全部公开材料在 [`store/`](store/README.md)：上架文案、隐私政策、审核说明、版本说明、逐项检查清单、测试页。提交前需补齐**支持邮箱**（文件中以 `<TODO: 填写支持邮箱>` 标注）并把代码推送到本仓库，使隐私政策链接可公开访问。

---

## 贡献与反馈

- 问题反馈：<https://github.com/PatenX-AI/translite/issues>
- 提交前请跑通上述 `node test-*.js`，并确保 `python scripts/build-xpi.py --verify` 通过。

© PatenX-AI · [Mozilla Public License 2.0](LICENSE)
