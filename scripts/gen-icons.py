#!/usr/bin/env python3
"""
轻译 TransLite · 扩展图标生成器（16 / 32 / 48 / 96 / 128 PNG）

字体：阿里妈妈方圆体 VF（Alimama FangYuanTi VF），字重轴 wght=600（SemiBold），
      BEVL 轴保持默认 100。字体为阿里妈妈免费字体，允许免费商用与嵌入式使用；
      但不得再分发字体文件、不得二次创作、不得作为商标注册。
      ==> 本仓库不包含字体文件，脚本只读取使用者本机已安装的字体。
      官方下载：https://www.iconfont.cn/fonts/detail?cnid=pOvFIr086ADR
      若本机未安装，请自行下载安装后运行，或用 --font 指定 TTF/OTF 路径。

方法：先在 1024×1024 母版（64 单位 ×16 超分）上绘制圆角底图与高分辨率字形，
      再「分级减半」用 LANCZOS 降采样到各尺寸，全部尺寸同源、轮廓一致；
      对 ≤48px 的小尺寸在母版上做轻微光学加粗（MaxFilter 13，约 0.8px@64），
      补偿方圆体 SemiBold 笔画偏细导致的缩小后变淡。此操作只作用于光栅化后的
      像素，不修改字体文件、不生成衍生字体。

用法：
    python scripts/gen-icons.py                    # 生成到 extension/icons/
    python scripts/gen-icons.py --font <path.ttf> # 指定字体
    python scripts/gen-icons.py --out <dir>       # 指定输出目录
    python scripts/gen-icons.py --check           # 只校验现有图标尺寸/透明度
    python scripts/gen-icons.py --list-font       # 打印找到的字体路径
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "extension" / "icons"

SS = 16                        # 超分倍数
M = 64 * SS                    # 1024px 母版
RADIUS = 9 * SS                # viewBox 64 时 rx=9
BLUE = (9, 105, 218, 255)      # #0969da
TARGET_INK = 0.78              # 字形墨迹高度 / 画布
WGHT = 600                     # SemiBold
BEVEL = 100
OPTICAL_BOLD = 13
SIZES = [16, 32, 48, 96, 128]


def find_font(explicit: str | None = None) -> Path | None:
    if explicit:
        p = Path(explicit)
        return p if p.is_file() else None
    env = os.environ.get("TL_ICON_FONT")
    if env and Path(env).is_file():
        return Path(env)
    roots = [
        os.environ.get("LOCALAPPDATA", ""),
        os.environ.get("WINDIR", ""),
        os.path.expanduser("~/.local/share/fonts"),
        os.path.expanduser("~/Library/Fonts"),
        "/usr/share/fonts",
        str(ROOT),
    ]
    seen = set()
    for base in filter(None, roots):
        b = Path(base)
        # 用户字体目录（Windows）
        for sub in ("Microsoft/Windows/Fonts", "Fonts", ""):
            d = b / sub if sub else b
            if not d.is_dir() or d in seen:
                continue
            seen.add(d)
            try:
                for p in d.glob("**/*"):
                    if (p.is_file() and p.suffix.lower() in (".ttf", ".otf")
                            and "alimamafangyuantivf" in p.name.lower()):
                        return p
            except OSError:
                continue
    return None


def font_at(path: Path, size: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(path), size)
    f.set_variation_by_axes([WGHT, BEVEL])
    return f


def draw_glyph(path: Path, size: int, pos: tuple[float, float]) -> Image.Image:
    mask = Image.new("L", (M, M), 0)
    ImageDraw.Draw(mask).text(pos, "译", font=font_at(path, size), fill=255, anchor="mm")
    return mask


def fit_glyph(path: Path) -> tuple[Image.Image, dict]:
    """迭代定尺 + 光学居中：墨迹高度≈78% 画布、墨迹中心位于画布中心。"""
    size, pos = 52 * SS, (M / 2, M / 2)
    for _ in range(4):
        mask = draw_glyph(path, size, pos)
        x0, y0, x1, y1 = mask.getbbox()
        size = max(8, int(round(size * (TARGET_INK * M) / (y1 - y0))))
        pos = (pos[0] + M / 2 - (x0 + x1) / 2, pos[1] + M / 2 - (y0 + y1) / 2)
    mask = draw_glyph(path, size, pos)
    x0, y0, x1, y1 = mask.getbbox()
    info = {
        "wght": WGHT,
        "bevel": BEVEL,
        "font_size_at_64": round(size / SS, 1),
        "ink_w_pct": round(100 * (x1 - x0) / M, 1),
        "ink_h_pct": round(100 * (y1 - y0) / M, 1),
    }
    return mask, info


def make_master(mask: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", (M, M), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle((0, 0, M - 1, M - 1), radius=RADIUS, fill=BLUE)
    white = Image.new("RGBA", (M, M), (255, 255, 255, 0))
    white.putalpha(mask)
    return Image.alpha_composite(bg, white)


def progressive_resize(master: Image.Image, size: int) -> Image.Image:
    cur = master
    while cur.width // 2 >= size:
        cur = cur.resize((cur.width // 2, cur.height // 2), Image.Resampling.LANCZOS)
    return cur if cur.width == size else cur.resize((size, size), Image.Resampling.LANCZOS)


def verify(out: Path) -> list[str]:
    problems = []
    for s in SIZES:
        p = out / f"icon-{s}.png"
        if not p.is_file():
            problems.append(f"缺少 {p.name}")
            continue
        im = Image.open(p).convert("RGBA")
        if im.size != (s, s):
            problems.append(f"{p.name} 尺寸 {im.size} != ({s},{s})")
        px = im.load()
        opaque = sum(1 for y in range(s) for x in range(s) if px[x, y][3] > 200)
        if opaque / (s * s) < 0.95:
            problems.append(f"{p.name} 底图未铺满（不透明 {opaque / (s * s):.1%}）")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser(description="TransLite 图标生成 / 校验")
    ap.add_argument("--font", help="阿里妈妈方圆体 VF 的 TTF/OTF 路径")
    ap.add_argument("--out", help="输出目录（默认 extension/icons/）")
    ap.add_argument("--check", action="store_true", help="只校验现有图标，不重新生成")
    ap.add_argument("--list-font", action="store_true", help="打印本机找到的字体路径")
    args = ap.parse_args()

    out = Path(args.out) if args.out else DEFAULT_OUT

    if args.check:
        problems = verify(out)
        if problems:
            raise SystemExit("图标校验失败: " + "; ".join(problems))
        print(f"OK: {out} 下 {len(SIZES)} 张图标尺寸与铺满度均通过")
        return

    font = find_font(args.font)
    if args.list_font:
        print(font if font else "NOT FOUND")
        return
    if not font:
        raise SystemExit(
            "未找到阿里妈妈方圆体 VF 字体。请先从 iconfont 官方下载安装，"
            "或用 --font 指定 TTF/OTF 路径（本仓库不分发字体文件）。\n"
            "官方地址: https://www.iconfont.cn/fonts/detail?cnid=pOvFIr086ADR")

    out.mkdir(parents=True, exist_ok=True)
    mask, info = fit_glyph(font)
    plain = make_master(mask)
    bold = make_master(mask.filter(ImageFilter.MaxFilter(OPTICAL_BOLD)))
    for s in SIZES:
        src = bold if s <= 48 else plain
        progressive_resize(src, s).save(out / f"icon-{s}.png")

    problems = verify(out)
    if problems:
        raise SystemExit("生成后校验失败: " + "; ".join(problems))
    report = {"font": font.name, "supersample": SS, "master": M,
              "downsample": "progressive LANCZOS", "optical_bold": OPTICAL_BOLD,
              "sizes": SIZES, **info}
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
