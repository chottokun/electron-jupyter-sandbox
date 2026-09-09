#!/usr/bin/env python3
"""Google Noto Sans JP サブセット版の軽量 wheel ビルドスクリプト

JIS X 0208 第1水準（2,965字）＋常用漢字＋ひらがな・カタカナ・英数字・記号を
サブセット化した Noto Sans JP を内包する超軽量 wheel を作成する。
"""

import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WHEELS_DIR = PROJECT_ROOT / "wheels"
PACKAGE_NAME = "japanize-noto-sans-jp"
MODULE_NAME = "japanize_noto_sans_jp"
VERSION = "1.0.0"

NOTO_URL = "https://github.com/googlefonts/noto-cjk/raw/main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf"


def get_jis_level1_and_symbols() -> str:
    """JIS X 0208 第1水準漢字 + ひらがな + カタカナ + 英数字 + 記号の文字列を取得"""
    chars = set()
    # ASCII印字可能文字
    for i in range(0x20, 0x7F):
        chars.add(chr(i))

    # JIS X 0208 区 1〜8 (記号, 数字, 英字, かな, カナ, ギリシャ, キリル, 罫線)
    # 区 16〜47 (第1水準漢字 2,965字)
    for ku in list(range(1, 9)) + list(range(16, 48)):
        for ten in range(1, 95):
            try:
                b = bytes([0xA0 + ku, 0xA0 + ten])
                char = b.decode("euc-jp")
                chars.add(char)
            except UnicodeDecodeError:
                pass

    return "".join(sorted(chars))


def build_wheel() -> Path:
    """サブセット OTF を生成し、Pure Python wheel を構築"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)

        # 1. Noto Sans JP のダウンロード（キャッシュ確認）
        cache_dir = Path("/tmp/noto_font_cache")
        cache_dir.mkdir(exist_ok=True)
        src_otf = cache_dir / "NotoSansJP-Regular.otf"
        if not src_otf.exists() or src_otf.stat().st_size == 0:
            print(f"⬇️  NotoSansJP-Regular.otf をダウンロード中 ({NOTO_URL})...")
            urllib.request.urlretrieve(NOTO_URL, src_otf)
            print(f"   完了: {src_otf.stat().st_size:,} bytes")
        else:
            print(f"📦 キャッシュ済みフォントを利用: {src_otf}")

        # 2. サブセット文字列の作成
        text_file = tmp_path / "chars.txt"
        chars = get_jis_level1_and_symbols()
        text_file.write_text(chars, encoding="utf-8")
        print(f"📝 サブセット対象文字数: {len(chars):,} 字 (JIS第1水準 + 常用 + 記号 + かな + 英数)")

        # 3. pyftsubset でサブセット化
        out_otf = tmp_path / "NotoSansJP-Subset.otf"
        cmd = [
            "pyftsubset",
            str(src_otf),
            f"--text-file={text_file}",
            f"--output-file={out_otf}",
        ]
        print("🔨 pyftsubset でフォントをサブセット化中...")
        subprocess.run(cmd, check=True)
        font_size = out_otf.stat().st_size
        print(f"✅ サブセットフォント生成完了: {font_size:,} bytes ({font_size / (1024*1024):.2f} MB)")

        # 4. パッケージディレクトリ構造の構築
        pkg_dir = tmp_path / MODULE_NAME
        fonts_dir = pkg_dir / "fonts"
        fonts_dir.mkdir(parents=True)
        shutil.copy(out_otf, fonts_dir / "NotoSansJP-Subset.otf")

        # __init__.py
        init_code = '''"""japanize-noto-sans-jp: Google Noto Sans JP 超軽量サブセットフォント自動設定モジュール"""

import os
import matplotlib
from matplotlib import font_manager

FONT_DIR = os.path.dirname(__file__)
FONT_FILE = os.path.join(FONT_DIR, "fonts", "NotoSansJP-Subset.otf")
FONT_NAME = "Noto Sans JP"


def japanize() -> None:
    """Noto Sans JP サブセットフォントを登録し、Matplotlib のフォントおよび SVG 設定を適用"""
    if os.path.exists(FONT_FILE):
        if hasattr(font_manager.fontManager, "addfont"):
            font_manager.fontManager.addfont(FONT_FILE)
        try:
            font_prop = font_manager.FontProperties(fname=FONT_FILE)
            name = font_prop.get_name()
        except Exception:
            name = FONT_NAME
        matplotlib.rc("font", family=[name, "Noto Sans JP", "sans-serif"])

    # SVG 描画時は文字をパス化せず <text> として出力し、Electron側のネイティブ描画エンジンに委ねる
    matplotlib.rcParams["svg.fonttype"] = "none"


japanize()
'''
        (pkg_dir / "__init__.py").write_text(init_code, encoding="utf-8")

        # 5. dist-info の構築
        dist_info = tmp_path / f"{MODULE_NAME}-{VERSION}.dist-info"
        dist_info.mkdir()

        metadata = f"""Metadata-Version: 2.1
Name: {PACKAGE_NAME}
Version: {VERSION}
Summary: Lightweight Google Noto Sans JP subset font (JIS Level 1) for Matplotlib in Pyodide/JupyterLite
Home-page: https://github.com/googlefonts/noto-cjk
Author: Google Deepmind / Electron Jupyter Sandbox
License: SIL Open Font License 1.1
Classifier: Programming Language :: Python :: 3
Classifier: License :: OSI Approved :: SIL Open Font License 1.1 (OFL-1.1)
Requires-Dist: matplotlib
"""
        (dist_info / "METADATA").write_text(metadata, encoding="utf-8")

        wheel_content = f"""Wheel-Version: 1.0
Generator: build_noto_wheel.py
Root-Is-Purelib: true
Tag: py3-none-any
"""
        (dist_info / "WHEEL").write_text(wheel_content, encoding="utf-8")
        (dist_info / "top_level.txt").write_text(f"{MODULE_NAME}\n", encoding="utf-8")

        # 6. wheel (ZIP) の生成
        wheel_filename = f"{MODULE_NAME}-{VERSION}-py3-none-any.whl"
        dest_wheel = WHEELS_DIR / wheel_filename

        with zipfile.ZipFile(dest_wheel, "w", compression=zipfile.ZIP_DEFLATED) as z:
            # パッケージファイル
            for f in pkg_dir.rglob("*"):
                if f.is_file():
                    arcname = f.relative_to(tmp_path)
                    z.write(f, arcname)
            # dist-info
            for f in dist_info.rglob("*"):
                if f.is_file():
                    arcname = f.relative_to(tmp_path)
                    z.write(f, arcname)

        wheel_size = dest_wheel.stat().st_size
        print(f"\n🎉 Wheel 作成完了: {dest_wheel.name} ({wheel_size:,} bytes, {wheel_size / (1024*1024):.2f} MB)")
        return dest_wheel


if __name__ == "__main__":
    build_wheel()
