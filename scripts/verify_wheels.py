#!/usr/bin/env python3
"""JupyterLite ビルド後の wheel 整合性検証スクリプト

ビルド後に以下を検証する:
1. wheels/ 内の全 .whl が jupyterlite/pypi/ にコピーされているか
2. jupyterlite/pypi/all.json に全パッケージが登録されているか
3. manifest.json との整合性チェック
4. wheel ファイルの SHA256 再検証

使用例:
    uv run python scripts/verify_wheels.py
"""

import hashlib
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WHEELS_DIR = PROJECT_ROOT / "wheels"
MANIFEST_PATH = WHEELS_DIR / "manifest.json"
PYPI_DIR = PROJECT_ROOT / "jupyterlite" / "pypi"
ALL_JSON_PATH = PYPI_DIR / "all.json"

# 検証結果カウンター
errors = 0
warnings = 0
checks = 0


def check(description: str, condition: bool, is_warning: bool = False) -> bool:
    """検証チェック"""
    global errors, warnings, checks
    checks += 1
    if condition:
        print(f"  ✅ {description}")
        return True
    elif is_warning:
        warnings += 1
        print(f"  ⚠️  {description}")
        return False
    else:
        errors += 1
        print(f"  ❌ {description}")
        return False


def main():
    global errors, warnings

    print("=== JupyterLite Wheel 整合性検証 ===\n")

    # 1. wheels/ ディレクトリの存在確認
    print("📁 1. wheels/ ディレクトリの確認")
    check("wheels/ ディレクトリが存在する", WHEELS_DIR.exists())

    wheel_files = sorted(WHEELS_DIR.glob("*.whl"))
    check(f"wheel ファイルが存在する ({len(wheel_files)} 件)", len(wheel_files) > 0)

    # 2. manifest.json の検証
    print("\n📋 2. manifest.json の検証")
    has_manifest = check("manifest.json が存在する", MANIFEST_PATH.exists())

    manifest_packages = {}
    if has_manifest:
        with open(MANIFEST_PATH, encoding="utf-8") as f:
            manifest = json.load(f)
        manifest_packages = manifest.get("packages", {})
        check(f"manifest.json にパッケージが登録されている ({len(manifest_packages)} 件)", len(manifest_packages) > 0)

        # manifest に記載されたファイルが実際に存在するか
        for pkg_name, pkg_info in manifest_packages.items():
            filename = pkg_info["filename"]
            wheel_path = WHEELS_DIR / filename
            check(f"{filename} が wheels/ に存在する", wheel_path.exists())

    # 3. SHA256 検証
    print("\n🔒 3. SHA256 ハッシュ検証")
    for whl in wheel_files:
        actual_hash = hashlib.sha256(whl.read_bytes()).hexdigest()

        # manifest にハッシュが記載されている場合は照合
        manifest_entry = None
        for pkg_info in manifest_packages.values():
            if pkg_info["filename"] == whl.name:
                manifest_entry = pkg_info
                break

        if manifest_entry and manifest_entry.get("sha256"):
            check(
                f"{whl.name}: SHA256 一致",
                actual_hash == manifest_entry["sha256"],
            )
        else:
            check(
                f"{whl.name}: manifest にハッシュ情報なし",
                False,
                is_warning=True,
            )

    # 4. jupyterlite/pypi/ への反映確認
    print("\n📦 4. JupyterLite ビルド出力の確認")
    check("jupyterlite/pypi/ ディレクトリが存在する", PYPI_DIR.exists())

    if PYPI_DIR.exists():
        for whl in wheel_files:
            pypi_whl = PYPI_DIR / whl.name
            check(f"{whl.name} が jupyterlite/pypi/ にコピーされている", pypi_whl.exists())

    # 5. all.json の検証
    print("\n📄 5. all.json パッケージインデックスの検証")
    has_all_json = check("jupyterlite/pypi/all.json が存在する", ALL_JSON_PATH.exists())

    if has_all_json:
        with open(ALL_JSON_PATH, encoding="utf-8") as f:
            all_json = json.load(f)

        for pkg_name, pkg_info in manifest_packages.items():
            # all.json のキーはパッケージ名（正規化済み）
            # 様々な形式で検索
            found = False
            for key in [pkg_name, pkg_name.replace("-", "_"), pkg_info.get("name", "").lower()]:
                if key in all_json:
                    found = True
                    # バージョンの存在確認
                    releases = all_json[key].get("releases", {})
                    check(
                        f"{pkg_name} が all.json に登録されている (v{pkg_info['version']})",
                        pkg_info["version"] in releases,
                    )
                    break
            if not found:
                check(f"{pkg_name} が all.json に登録されている", False)

    # サマリー
    print(f"\n{'=' * 50}")
    print(f"検証完了: {checks} チェック")
    print(f"  ✅ 成功: {checks - errors - warnings}")
    if warnings:
        print(f"  ⚠️  警告: {warnings}")
    if errors:
        print(f"  ❌ 失敗: {errors}")

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
