"""JupyterLite wheel 自動化スクリプトのテスト

add_wheels.py と verify_wheels.py の動作を検証する pytest テスト。

実行:
    uv run pytest tests/test_wheels.py -v
"""

import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# テスト対象のインポート
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import add_wheels  # noqa: E402


# --- フィクスチャ ---

@pytest.fixture
def tmp_wheels_dir(tmp_path):
    """一時的な wheels ディレクトリ"""
    wheels_dir = tmp_path / "wheels"
    wheels_dir.mkdir()
    return wheels_dir


@pytest.fixture
def sample_pyodide_lock(tmp_path):
    """テスト用の pyodide-lock.json"""
    lock_data = {
        "info": {
            "abi_version": "2026_0",
            "arch": "wasm32",
            "platform": "emscripten_5_0_3",
            "python": "3.14.2",
        },
        "packages": {
            "numpy": {"version": "2.4.6", "file_name": "numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl"},
            "pandas": {"version": "3.0.2", "file_name": "pandas-3.0.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl"},
            "lxml": {"version": "6.0.2", "file_name": "lxml-6.0.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl"},
            "pillow": {"version": "12.2.0", "file_name": "pillow-12.2.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl"},
            "typing_extensions": {"version": "4.15.0", "file_name": "typing_extensions-4.15.0-py3-none-any.whl"},
            "xlrd": {"version": "2.0.2", "file_name": "xlrd-2.0.2-py2.py3-none-any.whl"},
            "charset_normalizer": {"version": "3.4.7", "file_name": "charset_normalizer-3.4.7-py3-none-any.whl"},
        },
    }
    lock_path = tmp_path / "pyodide-lock.json"
    lock_path.write_text(json.dumps(lock_data), encoding="utf-8")
    return lock_path


# --- パッケージ名正規化のテスト ---

class TestNormalizeName:
    """PEP 503 パッケージ名正規化テスト"""

    def test_ハイフンをそのまま保持(self):
        assert add_wheels.normalize_name("python-docx") == "python-docx"

    def test_アンダースコアをハイフンに変換(self):
        assert add_wheels.normalize_name("typing_extensions") == "typing-extensions"

    def test_ドットをハイフンに変換(self):
        assert add_wheels.normalize_name("pdfminer.six") == "pdfminer-six"

    def test_連続区切り文字の正規化(self):
        assert add_wheels.normalize_name("some__pkg") == "some-pkg"

    def test_大文字を小文字に変換(self):
        assert add_wheels.normalize_name("XlsxWriter") == "xlsxwriter"


# --- Pyodide パッケージ除外リストのテスト ---

class TestPyodidePackages:
    """Pyodide 同梱パッケージ除外テスト"""

    def test_pyodide_lockからパッケージを読み込む(self, sample_pyodide_lock):
        with patch.object(add_wheels, "PYODIDE_LOCK_PATH", sample_pyodide_lock):
            pkgs = add_wheels.get_pyodide_packages()

        # ハイフンとアンダースコアの両方が含まれる
        assert "numpy" in pkgs
        assert "typing_extensions" in pkgs
        assert "typing-extensions" in pkgs

    def test_存在しないファイルでは空セット(self, tmp_path):
        with patch.object(add_wheels, "PYODIDE_LOCK_PATH", tmp_path / "nonexistent.json"):
            pkgs = add_wheels.get_pyodide_packages()
        assert pkgs == set()


# --- Pure Python wheel フィルタリングのテスト ---

class TestFindPurePythonWheel:
    """Pure Python wheel 検索テスト"""

    def test_py3_none_any_wheelを見つける(self):
        urls = [
            {"filename": "openpyxl-3.1.5.tar.gz", "url": "..."},
            {"filename": "openpyxl-3.1.5-py2.py3-none-any.whl", "url": "https://example.com/openpyxl.whl"},
        ]
        result = add_wheels.find_pure_python_wheel(urls)
        assert result is not None
        assert "py2.py3-none-any" in result["filename"]

    def test_ネイティブwheelのみの場合はNone(self):
        urls = [
            {"filename": "pkg-1.0-cp314-cp314-linux_x86_64.whl", "url": "..."},
            {"filename": "pkg-1.0.tar.gz", "url": "..."},
        ]
        result = add_wheels.find_pure_python_wheel(urls)
        assert result is None

    def test_空リストではNone(self):
        assert add_wheels.find_pure_python_wheel([]) is None


# --- 依存関係パースのテスト ---

class TestParseRequiresDist:
    """requires_dist パーステスト"""

    def test_通常の依存を抽出(self):
        requires = ["et-xmlfile", "lxml>=3.1.0"]
        result = add_wheels.parse_requires_dist(requires)
        assert "et-xmlfile" in result
        assert "lxml" in result

    def test_extra依存を除外(self):
        requires = [
            "et-xmlfile",
            "pytest ; extra == 'test'",
            "sphinx ; extra == \"docs\"",
        ]
        result = add_wheels.parse_requires_dist(requires)
        assert "et-xmlfile" in result
        assert "pytest" not in result
        assert "sphinx" not in result

    def test_python_versionマーカーで不要な依存を除外(self):
        requires = [
            'typing_extensions>=4.0; python_version < "3.11"',
        ]
        # Python 3.14 では不要
        result = add_wheels.parse_requires_dist(requires, python_version="3.14")
        assert len(result) == 0

    def test_python_versionマーカーで必要な依存を含む(self):
        requires = [
            'typing_extensions>=4.0; python_version < "3.15"',
        ]
        # Python 3.14 では必要
        result = add_wheels.parse_requires_dist(requires, python_version="3.14")
        assert "typing-extensions" in result

    def test_Noneでは空リスト(self):
        assert add_wheels.parse_requires_dist(None) == []


# --- 依存解決のテスト ---

class TestResolveDependencies:
    """依存関係の再帰解決テスト"""

    def _mock_metadata(self, name, version, filename, deps=None):
        """テスト用のメタデータ生成"""
        return {
            "info": {
                "name": name,
                "version": version,
                "requires_dist": deps,
            },
            "urls": [
                {
                    "filename": filename,
                    "url": f"https://example.com/{filename}",
                    "digests": {"sha256": "abc123"},
                }
            ],
        }

    def test_単一パッケージの解決(self):
        meta = self._mock_metadata("tabulate", "0.10.0", "tabulate-0.10.0-py3-none-any.whl")
        with patch.object(add_wheels, "fetch_pypi_metadata", return_value=meta):
            resolved = add_wheels.resolve_dependencies(["tabulate"], set())
        assert "tabulate" in resolved
        assert resolved["tabulate"]["version"] == "0.10.0"

    def test_Pyodide同梱パッケージをスキップ(self):
        pyodide_pkgs = {"numpy", "pandas", "lxml"}
        resolved = add_wheels.resolve_dependencies(["numpy"], pyodide_pkgs)
        assert "numpy" not in resolved

    def test_依存パッケージの再帰解決(self):
        def mock_fetch(name):
            if name == "openpyxl":
                return self._mock_metadata(
                    "openpyxl", "3.1.5", "openpyxl-3.1.5-py2.py3-none-any.whl",
                    deps=["et-xmlfile"]
                )
            elif name == "et-xmlfile":
                return self._mock_metadata(
                    "et_xmlfile", "2.0.0", "et_xmlfile-2.0.0-py3-none-any.whl"
                )
            return None

        with patch.object(add_wheels, "fetch_pypi_metadata", side_effect=mock_fetch):
            resolved = add_wheels.resolve_dependencies(["openpyxl"], set())

        assert "openpyxl" in resolved
        assert "et-xmlfile" in resolved

    def test_Pyodide同梱依存はスキップされる(self):
        """openpyxl → et_xmlfile は解決するが、lxml はPyodide同梱なのでスキップ"""
        def mock_fetch(name):
            if name == "python-docx":
                return self._mock_metadata(
                    "python-docx", "1.2.0", "python_docx-1.2.0-py3-none-any.whl",
                    deps=["lxml>=3.1.0", "typing_extensions>=4.9.0"]
                )
            return None

        pyodide_pkgs = {"lxml", "typing_extensions", "typing-extensions"}
        with patch.object(add_wheels, "fetch_pypi_metadata", side_effect=mock_fetch):
            resolved = add_wheels.resolve_dependencies(["python-docx"], pyodide_pkgs)

        assert "python-docx" in resolved
        assert "lxml" not in resolved
        assert "typing-extensions" not in resolved


# --- ダウンロードと SHA256 検証のテスト ---

class TestDownloadWheel:
    """wheel ダウンロードと SHA256 検証テスト"""

    def test_既存ファイルのハッシュ一致でスキップ(self, tmp_wheels_dir):
        content = b"test wheel content"
        sha256 = hashlib.sha256(content).hexdigest()
        (tmp_wheels_dir / "test-1.0-py3-none-any.whl").write_bytes(content)

        with patch.object(add_wheels, "WHEELS_DIR", tmp_wheels_dir):
            result = add_wheels.download_wheel(
                "https://example.com/test.whl",
                "test-1.0-py3-none-any.whl",
                sha256,
            )
        assert result is True

    def test_SHA256不一致で失敗(self, tmp_wheels_dir):
        content = b"downloaded content"
        wrong_sha256 = "0000000000000000000000000000000000000000000000000000000000000000"

        # urllib.request.urlopen をモック
        mock_resp = MagicMock()
        mock_resp.read.return_value = content
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch.object(add_wheels, "WHEELS_DIR", tmp_wheels_dir):
            with patch("urllib.request.urlopen", return_value=mock_resp):
                result = add_wheels.download_wheel(
                    "https://example.com/test.whl",
                    "test-1.0-py3-none-any.whl",
                    wrong_sha256,
                )
        assert result is False


# --- マニフェスト生成のテスト ---

class TestSaveManifest:
    """マニフェスト生成テスト"""

    def test_マニフェストJSON生成(self, tmp_wheels_dir):
        resolved = {
            "openpyxl": {
                "name": "openpyxl",
                "version": "3.1.5",
                "filename": "openpyxl-3.1.5-py2.py3-none-any.whl",
                "sha256": "abc123",
                "dependencies": ["et-xmlfile"],
            },
        }

        manifest_path = tmp_wheels_dir / "manifest.json"
        fake_lock_path = tmp_wheels_dir.parent / "pyodide-lock.json"
        with patch.object(add_wheels, "MANIFEST_PATH", manifest_path):
            with patch.object(add_wheels, "PROJECT_ROOT", tmp_wheels_dir.parent):
                with patch.object(add_wheels, "PYODIDE_LOCK_PATH", fake_lock_path):
                    add_wheels.save_manifest(resolved)

        assert manifest_path.exists()
        data = json.loads(manifest_path.read_text())
        assert "generatedAt" in data
        assert "openpyxl" in data["packages"]
        assert data["packages"]["openpyxl"]["version"] == "3.1.5"
        assert data["packages"]["openpyxl"]["dependencies"] == ["et-xmlfile"]


# --- プリセットのテスト ---

class TestPresets:
    """プリセット定義のテスト"""

    def test_officeプリセットが定義されている(self):
        assert "office" in add_wheels.PRESETS

    def test_officeプリセットにopenpyxlが含まれる(self):
        assert "openpyxl" in add_wheels.PRESETS["office"]

    def test_officeプリセットにpython_docxが含まれる(self):
        assert "python-docx" in add_wheels.PRESETS["office"]

    def test_officeプリセットにpython_pptxが含まれる(self):
        assert "python-pptx" in add_wheels.PRESETS["office"]

    def test_officeプリセットにpypdfが含まれる(self):
        assert "pypdf" in add_wheels.PRESETS["office"]

    def test_officeプリセットにmatplotlib_fontjaが含まれる(self):
        assert "matplotlib-fontja" in add_wheels.PRESETS["office"]

    def test_japaneseプリセットが定義されている(self):
        assert "japanese" in add_wheels.PRESETS
        assert "matplotlib-fontja" in add_wheels.PRESETS["japanese"]


# --- ライブ統合テスト（ネットワーク必要） ---

@pytest.mark.skipif(
    os.environ.get("SKIP_NETWORK_TESTS", "").lower() in ("1", "true"),
    reason="ネットワークテストをスキップ"
)
class TestLiveIntegration:
    """実際の PyPI API を使った統合テスト"""

    def test_PyPIからopenpyxlのメタデータ取得(self):
        metadata = add_wheels.fetch_pypi_metadata("openpyxl")
        assert metadata is not None
        assert metadata["info"]["name"] == "openpyxl"
        assert "version" in metadata["info"]

    def test_存在しないパッケージでNone(self):
        metadata = add_wheels.fetch_pypi_metadata("this-package-definitely-does-not-exist-12345")
        assert metadata is None

    def test_openpyxlにPure_Python_wheelがある(self):
        metadata = add_wheels.fetch_pypi_metadata("openpyxl")
        assert metadata is not None
        wheel = add_wheels.find_pure_python_wheel(metadata.get("urls", []))
        assert wheel is not None
        assert "none-any" in wheel["filename"]

    def test_openpyxlの依存にet_xmlfileが含まれる(self):
        metadata = add_wheels.fetch_pypi_metadata("openpyxl")
        assert metadata is not None
        deps = add_wheels.parse_requires_dist(metadata["info"].get("requires_dist"))
        assert "et-xmlfile" in deps
