#!/usr/bin/env python3
"""JupyterLite 向け wheel 追加自動化スクリプト

PyPI API からパッケージをダウンロードし、依存関係を再帰的に解決して
wheels/ ディレクトリに配置する。Pyodide 同梱パッケージは自動除外。

使用例:
    # パッケージ指定でダウンロード
    uv run python scripts/add_wheels.py openpyxl python-docx

    # ドライラン（ダウンロードせず依存関係のみ表示）
    uv run python scripts/add_wheels.py openpyxl --dry-run

    # wheels/ をクリアして再ダウンロード
    uv run python scripts/add_wheels.py openpyxl --clean

    # プリセット（オフィス系一括）
    uv run python scripts/add_wheels.py --preset office

    # pip-audit による脆弱性チェック
    uv run python scripts/add_wheels.py --audit
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

# プロジェクトルート
PROJECT_ROOT = Path(__file__).resolve().parent.parent
WHEELS_DIR = PROJECT_ROOT / "wheels"
MANIFEST_PATH = WHEELS_DIR / "manifest.json"
PYODIDE_LOCK_PATH = PROJECT_ROOT / "jupyterlite" / "static" / "pyodide" / "pyodide-lock.json"

# プリセット定義
PRESETS = {
    "office": [
        "openpyxl",               # Excel読み書き (.xlsx)
        "xlsxwriter",             # Excel書き込み (.xlsx)
        "python-docx",            # Word読み書き (.docx)
        "python-pptx",            # PowerPoint読み書き (.pptx)
        "pypdf",                  # PDF読み書き
        "tabulate",               # テーブル整形出力
        "reportlab",              # PDF生成
        "defusedxml",             # セキュアXML解析
        "japanize-noto-sans-jp",  # 超軽量 Google Noto Sans JP サブセットフォント（SVG対応）
    ],
    "japanese": [
        "japanize-noto-sans-jp",  # 超軽量 Google Noto Sans JP サブセットフォント（SVG対応）
    ],
}


def find_local_wheel(pkg_name: str) -> Path | None:
    """wheels/ 配下からローカルビルド済み wheel を検索"""
    norm = normalize_name(pkg_name).replace("-", "_")
    for f in WHEELS_DIR.glob("*.whl"):
        parts = f.name.split("-")
        if len(parts) >= 2:
            f_norm = normalize_name(parts[0]).replace("-", "_")
            if f_norm == norm:
                return f
    return None


def read_local_wheel_info(wheel_path: Path) -> dict | None:
    """ローカル wheel ファイルからメタデータとハッシュを取得"""
    import zipfile
    try:
        data = wheel_path.read_bytes()
        sha256 = hashlib.sha256(data).hexdigest()
        with zipfile.ZipFile(wheel_path) as z:
            # .dist-info/METADATA を検索
            metadata_files = [n for n in z.namelist() if n.endswith(".dist-info/METADATA")]
            if not metadata_files:
                return None
            meta_text = z.read(metadata_files[0]).decode("utf-8")

        name = wheel_path.name.split("-")[0]
        version = wheel_path.name.split("-")[1]
        deps = []
        for line in meta_text.splitlines():
            if line.startswith("Name:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("Version:"):
                version = line.split(":", 1)[1].strip()
            elif line.startswith("Requires-Dist:"):
                dep_spec = line.split(":", 1)[1].strip()
                deps.extend(parse_requires_dist([dep_spec]))

        return {
            "name": name,
            "version": version,
            "filename": wheel_path.name,
            "url": "",
            "sha256": sha256,
            "dependencies": deps,
            "is_local": True,
        }
    except Exception as e:
        print(f"⚠️  ローカル wheel 読み込み失敗 ({wheel_path.name}): {e}")
        return None


def get_pyodide_packages() -> set[str]:
    """Pyodide 同梱パッケージ名のセットを返す"""
    if not PYODIDE_LOCK_PATH.exists():
        print(f"⚠️  pyodide-lock.json が見つかりません: {PYODIDE_LOCK_PATH}")
        print("   Pyodide除外リストなしで続行します")
        return set()

    with open(PYODIDE_LOCK_PATH, encoding="utf-8") as f:
        lock_data = json.load(f)

    packages = set(lock_data.get("packages", {}).keys())
    # 正規化: ハイフン → アンダースコアの両方を登録
    normalized = set()
    for pkg in packages:
        normalized.add(pkg)
        normalized.add(pkg.replace("-", "_"))
        normalized.add(pkg.replace("_", "-"))
    return normalized


def normalize_name(name: str) -> str:
    """PEP 503 に準拠したパッケージ名の正規化"""
    return re.sub(r"[-_.]+", "-", name).lower()


def fetch_pypi_metadata(package_name: str) -> dict | None:
    """PyPI JSON API からパッケージメタデータを取得"""
    url = f"https://pypi.org/pypi/{package_name}/json"
    req = urllib.request.Request(url, headers={"User-Agent": "electron-jupyter-sandbox/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"  ❌ パッケージ '{package_name}' が PyPI に見つかりません")
        else:
            print(f"  ❌ PyPI API エラー: {e.code} {e.reason}")
        return None
    except urllib.error.URLError as e:
        print(f"  ❌ ネットワークエラー: {e.reason}")
        return None


def find_pure_python_wheel(urls: list[dict]) -> dict | None:
    """Pure Python wheel (py3-none-any / py2.py3-none-any) を検索"""
    candidates = [
        u for u in urls
        if u["filename"].endswith(".whl")
        and ("py3-none-any" in u["filename"] or "py2.py3-none-any" in u["filename"])
    ]
    if not candidates:
        return None
    # 最新のものを返す（通常リスト末尾）
    return candidates[-1]


def parse_requires_dist(requires_dist: list[str] | None, python_version: str = "3.14") -> list[str]:
    """requires_dist から必須依存パッケージ名を抽出

    環境マーカー付きの依存（; extra == ... や ; python_version < ...）を
    簡易的にフィルタリングする。
    """
    if not requires_dist:
        return []

    deps = []
    for dep_str in requires_dist:
        # extra 条件付きは除外（オプション依存）
        if "extra ==" in dep_str or "extra ==" in dep_str.replace("'", '"'):
            continue

        # パッケージ名を抽出（バージョン指定やマーカーの前まで）
        match = re.match(r"^([A-Za-z0-9_.-]+)", dep_str.strip())
        if not match:
            continue

        pkg_name = match.group(1)

        # python_version マーカーの簡易評価
        if "; " in dep_str:
            marker_part = dep_str.split(";", 1)[1].strip()
            # python_version < "3.X" の場合はスキップ（3.14では不要）
            pv_match = re.search(r'python_version\s*<\s*["\'](\d+\.\d+)["\']', marker_part)
            if pv_match:
                required_below = pv_match.group(1)
                if tuple(map(int, python_version.split("."))) >= tuple(map(int, required_below.split("."))):
                    continue

        deps.append(normalize_name(pkg_name))

    return deps


def resolve_dependencies(
    packages: list[str],
    pyodide_pkgs: set[str],
    resolved: dict | None = None,
    depth: int = 0,
    dry_run: bool = False,
) -> dict:
    """依存関係を再帰的に解決

    Returns:
        resolved: {正規化名: {version, filename, url, sha256, dependencies}}
    """
    if resolved is None:
        resolved = {}

    for pkg in packages:
        norm_name = normalize_name(pkg)

        # 既に解決済み
        if norm_name in resolved:
            continue

        # Pyodide 同梱パッケージはスキップ
        if norm_name in pyodide_pkgs or norm_name.replace("-", "_") in pyodide_pkgs:
            indent = "  " * depth
            print(f"{indent}⏭️  {pkg} → Pyodide 同梱済み（スキップ）")
            continue

        indent = "  " * depth

        # ローカル wheel の確認（japanize-noto-sans-jp 等の独自ビルド品）
        local_whl = find_local_wheel(pkg)
        if local_whl:
            local_info = read_local_wheel_info(local_whl)
            if local_info:
                print(f"{indent}📦 {pkg} {local_info['version']} → ローカル wheel を検出 ({local_whl.name})")
                resolved[norm_name] = local_info
                # 依存関係の再帰解決
                if local_info["dependencies"]:
                    resolve_dependencies(
                        local_info["dependencies"],
                        pyodide_pkgs,
                        resolved=resolved,
                        depth=depth + 1,
                        dry_run=dry_run,
                    )
                continue

        print(f"{indent}🔍 {pkg} のメタデータを取得中...")

        metadata = fetch_pypi_metadata(pkg)
        if not metadata:
            continue

        version = metadata["info"]["version"]
        urls = metadata.get("urls", [])
        wheel_info = find_pure_python_wheel(urls)

        if not wheel_info:
            print(f"{indent}⚠️  {pkg} {version}: Pure Python wheel が見つかりません（スキップ）")
            continue

        sha256 = wheel_info.get("digests", {}).get("sha256", "")

        resolved[norm_name] = {
            "name": metadata["info"]["name"],
            "version": version,
            "filename": wheel_info["filename"],
            "url": wheel_info["url"],
            "sha256": sha256,
            "dependencies": [],
        }

        print(f"{indent}✅ {pkg} {version} ({wheel_info['filename']})")

        # 依存パッケージの解決
        requires_dist = metadata["info"].get("requires_dist")
        dep_names = parse_requires_dist(requires_dist)
        resolved[norm_name]["dependencies"] = dep_names

        if dep_names:
            print(f"{indent}   依存: {', '.join(dep_names)}")
            resolve_dependencies(dep_names, pyodide_pkgs, resolved, depth + 1, dry_run)

    return resolved


def download_wheel(url: str, filename: str, expected_sha256: str) -> bool:
    """wheel をダウンロードし SHA256 を検証"""
    dest = WHEELS_DIR / filename

    if dest.exists():
        # 既存ファイルのハッシュチェック
        actual = hashlib.sha256(dest.read_bytes()).hexdigest()
        if actual == expected_sha256:
            print(f"  ⏭️  {filename} → 既存（ハッシュ一致）")
            return True
        else:
            print(f"  ⚠️  {filename} → ハッシュ不一致、再ダウンロード")

    if not url:
        print(f"  ❌ {filename}: ダウンロード URL がありません")
        return False

    req = urllib.request.Request(url, headers={"User-Agent": "electron-jupyter-sandbox/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        print(f"  ❌ ダウンロード失敗: {filename} ({e})")
        return False

    actual_sha256 = hashlib.sha256(data).hexdigest()
    if expected_sha256 and actual_sha256 != expected_sha256:
        print(f"  ❌ SHA256 不一致: {filename}")
        print(f"     期待: {expected_sha256}")
        print(f"     実際: {actual_sha256}")
        return False

    dest.write_bytes(data)
    print(f"  ⬇️  {filename} ({len(data):,} bytes)")
    return True


def save_manifest(resolved: dict, merge: bool = True) -> None:
    """マニフェストファイルを生成・更新"""
    from datetime import datetime, timezone

    existing_packages = {}
    if merge and MANIFEST_PATH.exists():
        try:
            old_manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            existing_packages = old_manifest.get("packages", {})
        except Exception:
            pass

    packages = dict(existing_packages)
    for norm_name, info in sorted(resolved.items()):
        packages[norm_name] = {
            "name": info["name"],
            "version": info["version"],
            "filename": info["filename"],
            "sha256": info["sha256"],
            "dependencies": info["dependencies"],
        }

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pyodideLockPath": str(PYODIDE_LOCK_PATH.relative_to(PROJECT_ROOT)),
        "packages": dict(sorted(packages.items())),
    }

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n📋 マニフェスト更新: {MANIFEST_PATH.relative_to(PROJECT_ROOT)}")


def run_audit() -> int:
    """pip-audit でダウンロード済み wheel の脆弱性チェック"""
    wheel_files = list(WHEELS_DIR.glob("*.whl"))
    if not wheel_files:
        print("⚠️  wheels/ にファイルがありません")
        return 0

    print("\n🔒 pip-audit による脆弱性チェック...")
    print(f"   対象: {len(wheel_files)} パッケージ (wheels/)\n")

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip_audit", "--path", str(WHEELS_DIR), "--desc"],
            capture_output=True,
            text=True,
        )
        print(result.stdout)
        if result.stderr:
            print(result.stderr)

        if result.returncode != 0:
            print("⚠️  脆弱性が検出されました")
        else:
            print("✅ 脆弱性は検出されませんでした")

        return result.returncode
    except FileNotFoundError:
        print("❌ pip-audit がインストールされていません")
        print("   インストール: uv add --dev pip-audit")
        return 1


def clean_wheels() -> None:
    """wheels/ ディレクトリをクリア（manifest.json は残す）"""
    count = 0
    for f in WHEELS_DIR.glob("*.whl"):
        f.unlink()
        count += 1
    if MANIFEST_PATH.exists():
        MANIFEST_PATH.unlink()
        count += 1
    print(f"🗑️  wheels/ をクリア（{count} ファイル削除）")


def main():
    parser = argparse.ArgumentParser(
        description="JupyterLite 向け wheel 追加自動化",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  %(prog)s openpyxl python-docx    パッケージを指定してダウンロード
  %(prog)s --preset office         オフィス系プリセットを一括ダウンロード
  %(prog)s --preset office --dry-run  ドライラン（確認のみ）
  %(prog)s --audit                 脆弱性チェック（pip-audit）
  %(prog)s --clean --preset office   クリーン再ダウンロード
        """,
    )
    parser.add_argument("packages", nargs="*", help="ダウンロードするパッケージ名")
    parser.add_argument("--preset", choices=list(PRESETS.keys()), help="プリセットパッケージセット")
    parser.add_argument("--dry-run", action="store_true", help="ダウンロードせず依存関係のみ表示")
    parser.add_argument("--clean", action="store_true", help="wheels/ をクリアしてからダウンロード")
    parser.add_argument("--audit", action="store_true", help="pip-audit で脆弱性チェック")

    args = parser.parse_args()

    # --audit のみの場合
    if args.audit and not args.packages and not args.preset:
        sys.exit(run_audit())

    # パッケージリストの構築
    target_packages = list(args.packages or [])
    if args.preset:
        preset_pkgs = PRESETS[args.preset]
        print(f"📦 プリセット '{args.preset}': {', '.join(preset_pkgs)}")
        target_packages.extend(preset_pkgs)

    if not target_packages:
        parser.print_help()
        sys.exit(1)

    # 重複排除
    seen = set()
    unique_packages = []
    for p in target_packages:
        norm = normalize_name(p)
        if norm not in seen:
            seen.add(norm)
            unique_packages.append(p)

    # クリーン
    if args.clean:
        clean_wheels()

    WHEELS_DIR.mkdir(exist_ok=True)

    # Pyodide 同梱パッケージの読み込み
    pyodide_pkgs = get_pyodide_packages()
    if pyodide_pkgs:
        print(f"📋 Pyodide 同梱パッケージ: {len(pyodide_pkgs) // 3} 件を除外リストに登録\n")

    # 依存解決
    print("=== 依存関係の解決 ===\n")
    resolved = resolve_dependencies(unique_packages, pyodide_pkgs, dry_run=args.dry_run)

    if not resolved:
        print("\n⚠️  ダウンロード対象のパッケージがありません")
        sys.exit(0)

    print(f"\n📊 合計 {len(resolved)} パッケージを処理します")

    if args.dry_run:
        print("\n--- ドライラン完了（ダウンロードはスキップ）---")
        for norm_name, info in sorted(resolved.items()):
            deps = f" (依存: {', '.join(info['dependencies'])})" if info["dependencies"] else ""
            print(f"  {info['name']} {info['version']}{deps}")
        sys.exit(0)

    # ダウンロード
    print("\n=== ダウンロード ===\n")
    success_count = 0
    fail_count = 0
    for norm_name, info in sorted(resolved.items()):
        if download_wheel(info["url"], info["filename"], info["sha256"]):
            success_count += 1
        else:
            fail_count += 1

    # マニフェスト生成
    save_manifest(resolved, merge=not args.clean)

    # サマリー
    print(f"\n{'=' * 50}")
    print(f"✅ 成功: {success_count}")
    if fail_count:
        print(f"❌ 失敗: {fail_count}")
    print(f"📁 保存先: {WHEELS_DIR.relative_to(PROJECT_ROOT)}/")
    print(f"\n次のステップ:")
    print(f"  npm run build:jupyter  # JupyterLite を再ビルド")
    if not args.audit:
        print(f"  uv run python scripts/add_wheels.py --audit  # 脆弱性チェック")

    # --audit が指定されていれば脆弱性チェックも実行
    if args.audit:
        run_audit()

    sys.exit(1 if fail_count else 0)


if __name__ == "__main__":
    main()
