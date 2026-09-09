#!/usr/bin/env python3
import subprocess
import time
import os
import sys
import tempfile
from playwright.sync_api import sync_playwright

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 kernel-preload.e2e.py <port>")
        sys.exit(1)

    port = sys.argv[1]
    print(f"Connecting to JupyterLite server on port {port}...")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        )
        page = browser.new_page()

        page.goto(f'http://127.0.0.1:{port}/lab/index.html', wait_until='domcontentloaded')
        page.wait_for_selector('#jp-main-dock-panel', timeout=30000)

        # 1. Verify injected jupyter-lite.json settings
        res = page.evaluate('fetch("/jupyter-lite.json").then(r => r.json())')
        kernel_settings = res['jupyter-config-data']['settingsOverrides']['@jupyterlite/pyodide-kernel-extension:kernel']
        assert 'matplotlib' in kernel_settings['loadPyodideOptions']['packages']
        assert 'pandas' in kernel_settings['loadPyodideOptions']['packages']
        assert 'japanize-noto-sans-jp' in kernel_settings['piplitePreloadPackages']
        assert 'openpyxl' in kernel_settings['piplitePreloadPackages']

        # 2. Open new Python notebook
        notebook_card = page.wait_for_selector('div.jp-LauncherCard[title*="Python"]', timeout=20000)
        notebook_card.click()

        time.sleep(3)

        # 3. Type imports into cell without calling piplite.install
        cell_editor = page.locator('.jp-Notebook .cm-content').first
        cell_editor.wait_for(timeout=20000)
        cell_editor.click()

        test_code = (
            "import numpy as np\n"
            "import pandas as pd\n"
            "import matplotlib.pyplot as plt\n"
            "import japanize_noto_sans_jp\n"
            "import openpyxl\n"
            "print('E2E_PRELOAD_SUCCESS')\n"
        )

        page.keyboard.insert_text(test_code)
        page.keyboard.press('Shift+Enter')

        # 4. Wait for output area text
        nb = page.locator('.jp-Notebook').first
        success = False
        for _ in range(60):
            time.sleep(1)
            text = nb.inner_text()
            if 'E2E_PRELOAD_SUCCESS' in text:
                success = True
                break

        assert success, f'Expected E2E_PRELOAD_SUCCESS in notebook text. Got:\n{nb.inner_text()}'
        print('SUCCESS: Preloaded packages imported without piplite.install!')

        browser.close()

if __name__ == '__main__':
    main()
