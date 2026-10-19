"""字体子集化：把 public/assets/fonts 下的 woff2 裁到基本拉丁字符。

站点的中文走系统字体（PingFang / 微软雅黑），这 7 个 woff2 只负责拉丁字母、
数字与标点（品牌标 "Beyond ! JUBEAT ~"、jubeat 大字、少量英文标签）。
原始完整字体已备份到 archive/materials/wiki-v4/fonts-orig/。

依赖：pip install fonttools brotli
用法：python scripts/subset-fonts.py [--text "自定义字符集"]
      默认裁到 U+0020-007E（ASCII 可打印字符），最安全。
"""
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "public", "assets", "fonts")


def main() -> int:
    text = None
    if "--text" in sys.argv:
        text = sys.argv[sys.argv.index("--text") + 1]

    total_before = total_after = 0
    for path in sorted(glob.glob(os.path.join(FONT_DIR, "*.woff2"))):
        tmp = path + ".sub"
        cmd = [sys.executable, "-m", "fontTools.subset", path, "--flavor=woff2",
               "--output-file=" + tmp, "--layout-features=*"]
        cmd.append("--text=" + text if text else "--unicodes=U+0020-007E")
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
        before, after = os.path.getsize(path), os.path.getsize(tmp)
        os.replace(tmp, path)
        total_before += before
        total_after += after
        print(f"{os.path.basename(path):<24} {before:>7} -> {after:>7}  ({(after / before - 1) * 100:+.0f}%)")
    print(f"{'TOTAL':<24} {total_before:>7} -> {total_after:>7}  ({(total_after / total_before - 1) * 100:+.0f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
