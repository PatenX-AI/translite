#!/usr/bin/env python3
"""
TransLite · Firefox XPI / 源码包构建脚本（可复现、零依赖）

用法（在项目根目录执行）：
    python scripts/build-xpi.py                 # 生成 dist/translite-<version>.xpi
    python scripts/build-xpi.py --source-zip   # 额外生成 store/translite-<version>-source.zip
    python scripts/build-xpi.py --verify FILE  # 校验已有 XPI 结构与清单引用

说明：
  * 本扩展不含编译/压缩/打包步骤，XPI 内的 JS 即源码，可直接审阅。
  * 打包采用白名单，只包含运行所需文件，测试页/截图/文档/缓存一律排除。
  * ZIP 条目按路径排序、时间戳固定，保证同一份源码产出字节一致的 XPI。
  * 路径分隔符统一为 '/'，不写入任何本机绝对路径。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
DIST = ROOT / "dist"
STORE = ROOT / "store"

# XPI 白名单：相对 extension/ 的路径
XPI_FILES = (
    "manifest.json",
    "background.js",
    "content.js",
    "lib/core.js",
    "lib/sync-chunks.js",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-96.png",
    "icons/icon-128.png",
)

# 源码包额外包含（相对项目根）：构建脚本、公开文档与纯 Node 单测
SOURCE_EXTRA = (
    "README.md",
    "LICENSE",
    ".gitignore",
    "scripts/build-xpi.py",
    "scripts/gen-icons.py",
    "store/README.md",
    "store/LISTING.md",
    "store/PRIVACY-POLICY.md",
    "store/REVIEWER-NOTES.md",
    "store/RELEASE-NOTES.md",
    "store/SUBMISSION-CHECKLIST.md",
    "store/test-page.html",
    "test-core.js",
    "test-sync-chunks.js",
    "test-background.js",
    "test-gate.js",
    "test-segments.js",
)

FIXED_TS = (1980, 1, 1, 0, 0, 0)


def read_version() -> str:
    data = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))
    v = data.get("version")
    if not v:
        raise SystemExit("manifest.json 缺少 version")
    return v


def check_sources() -> None:
    missing = [p for p in XPI_FILES if not (EXT / p).is_file()]
    if missing:
        raise SystemExit("缺少打包文件: " + ", ".join(missing))


def check_manifest_refs() -> None:
    """校验 manifest.json 引用的本地文件都真实存在且位于白名单内。"""
    m = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))
    refs = []
    refs += list((m.get("icons") or {}).values())
    refs += list((m.get("background") or {}).get("scripts", []) or [])
    action = m.get("action") or {}
    refs += list((action.get("default_icon") or {}).values())
    if action.get("default_popup"):
        refs.append(action["default_popup"])
    for p in refs:
        if not (EXT / p).is_file():
            raise SystemExit(f"manifest 引用了不存在的文件: {p}")
        if p.replace("\\", "/") not in XPI_FILES:
            raise SystemExit(f"manifest 引用未纳入白名单: {p}")
    dcp = (m.get("browser_specific_settings") or {}).get("gecko", {}).get("data_collection_permissions")
    if not dcp or not dcp.get("required"):
        raise SystemExit("AMO 要求 manifest 声明 data_collection_permissions.required")


def write_zip(out: Path, entries: list[tuple[str, bytes]]) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(entries, key=lambda x: x[0]):
            info = zipfile.ZipInfo(name, date_time=FIXED_TS)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            info.create_system = 3
            z.writestr(info, data)


def build_xpi(version: str) -> Path:
    check_sources()
    check_manifest_refs()
    entries = [(p, (EXT / p).read_bytes()) for p in XPI_FILES]
    out = DIST / f"translite-{version}.xpi"
    write_zip(out, entries)
    return out


def build_source_zip(version: str) -> Path:
    check_sources()
    entries: list[tuple[str, bytes]] = []
    for p in XPI_FILES:
        entries.append((f"extension/{p}", (EXT / p).read_bytes()))
    for p in SOURCE_EXTRA:
        f = ROOT / p
        if f.is_file():
            entries.append((p, f.read_bytes()))
    out = STORE / f"translite-{version}-source.zip"
    write_zip(out, entries)
    return out


def verify(path: Path) -> None:
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
    if "manifest.json" not in names:
        raise SystemExit("XPI 根目录缺少 manifest.json")
    if any(n.startswith("/") or ".." in n.split("/") or "\\" in n for n in names):
        raise SystemExit("XPI 含不安全路径")
    if names != sorted(XPI_FILES):
        raise SystemExit("XPI 文件清单与白名单不一致:\n  实际: " + ", ".join(names))
    m = json.loads(zipfile.ZipFile(path).read("manifest.json").decode("utf-8"))
    print(f"OK   manifest: {m['name']} v{m['version']} / id={m['browser_specific_settings']['gecko']['id']}")
    print(f"OK   entries : {len(names)} 个文件，全部为白名单内运行所需文件")
    print(f"OK   sha256  : {hashlib.sha256(path.read_bytes()).hexdigest()}")
    print(f"OK   size    : {path.stat().st_size} bytes")


def main() -> None:
    ap = argparse.ArgumentParser(description="TransLite XPI 构建 / 校验")
    ap.add_argument("--source-zip", action="store_true", help="同时生成 AMO 源码包")
    ap.add_argument("--verify", metavar="FILE", help="校验已有 XPI，不重新构建")
    args = ap.parse_args()

    if args.verify:
        verify(Path(args.verify))
        return

    version = read_version()
    xpi = build_xpi(version)
    print(f"BUILT {xpi.relative_to(ROOT)}")
    verify(xpi)
    if args.source_zip:
        src = build_source_zip(version)
        print(f"BUILT {src.relative_to(ROOT)}  ({src.stat().st_size} bytes)")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code:
            print("ERROR:", e, file=sys.stderr)
        raise
