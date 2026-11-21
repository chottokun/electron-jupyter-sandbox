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
        page.on('console', lambda msg: print('PAGE LOG:', msg.type, msg.text))
        page.on('pageerror', lambda err: print('PAGE ERROR:', err))

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
            "with open('auto_synced_from_pyodide.txt', 'w', encoding='utf-8') as f:\n"
            "    f.write('SYNC_OK_123')\n"
            "print('E2E_PRELOAD_SUCCESS')\n"
        )

        page.keyboard.insert_text(test_code)
        page.keyboard.press('Shift+Enter')

        # 4. Wait for output area text (specifically in .jp-OutputArea-output)
        output_loc = page.locator('.jp-OutputArea-output').first
        success = False
        for _ in range(60):
            time.sleep(1)
            if output_loc.count() > 0 and 'E2E_PRELOAD_SUCCESS' in output_loc.inner_text():
                success = True
                break

        assert success, f'Expected E2E_PRELOAD_SUCCESS in cell output. Got:\n{page.locator(".jp-Notebook").first.inner_text()}'
        print('SUCCESS: Preloaded packages imported without piplite.install!')

        # 5. Verify bidirectional file sync (Pyodide MEMFS -> Host Contents API)
        synced = False
        for _ in range(30):
            time.sleep(0.5)
            api_res = page.evaluate('fetch("/api/contents/auto_synced_from_pyodide.txt").then(r => r.ok ? r.json() : null)')
            if api_res and api_res.get('content') == 'SYNC_OK_123':
                synced = True
                break

        assert synced, 'Expected auto_synced_from_pyodide.txt to be automatically synced to Host Contents API'
        print('SUCCESS: Bidirectional file sync (MEMFS -> Host) verified!')

        # 6. Verify AI full notebook copy toolbar button exists
        toolbar_btn = page.locator('.ai-copy-notebook-btn').first
        assert toolbar_btn.is_visible(), 'Expected AI notebook copy button in toolbar'
        print('SUCCESS: AI full notebook copy toolbar button verified!')

        browser.close()

if __name__ == '__main__':
    main()
