#!/usr/bin/env python3
import subprocess
import time
import os
import sys
import tempfile
from playwright.sync_api import sync_playwright

def main():
    tmp_dir = tempfile.mkdtemp()
    port_file = os.path.join(tmp_dir, 'port.txt')
    config_path = os.path.join(tmp_dir, 'config.json')

    node_script = f"""
const {{ startLocalServer }} = require("{os.path.abspath('src/server.js')}");
const {{ saveConfig }} = require("{os.path.abspath('src/config.js')}");
const fs = require("fs");
const path = require("path");

const dataDir = path.join("{tmp_dir}", "data");
fs.mkdirSync(dataDir, {{ recursive: true }});
saveConfig("{config_path}", {{
  preloadPackages: ["japanize-noto-sans-jp", "matplotlib", "pandas", "numpy", "openpyxl"]
}});

startLocalServer("{os.path.abspath('jupyterlite')}", dataDir, 59910).then(({{ port }}) => {{
  fs.writeFileSync("{port_file}", String(port));
}});
"""

    node_file = os.path.join(tmp_dir, 'server.js')
    with open(node_file, 'w') as f:
        f.write(node_script)

    server_proc = subprocess.Popen(['node', node_file])

    for _ in range(50):
        if os.path.exists(port_file):
            break
        time.sleep(0.2)

    if not os.path.exists(port_file):
        print("Server failed to start")
        server_proc.terminate()
        sys.exit(1)

    with open(port_file) as f:
        port = f.read().strip()

    print('Server started on port:', port)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            page.on('console', lambda msg: print('PAGE LOG:', msg.type, msg.text))
            page.on('pageerror', lambda err: print('PAGE ERROR:', err))

            page.goto(f'http://127.0.0.1:{port}/lab/index.html')
            page.wait_for_selector('#jp-main-dock-panel', timeout=30000)
            print('JupyterLab Dock Panel loaded!')

            # Click Python notebook card in Launcher
            notebook_card = page.wait_for_selector('div.jp-LauncherCard[title*="Python"]', timeout=15000)
            notebook_card.click()
            print('Clicked notebook launcher card!')

            time.sleep(3)

            # Click cell editor
            cell_editor = page.locator('.jp-Notebook .cm-content').first
            cell_editor.wait_for(timeout=20000)
            cell_editor.click()
            print('Clicked cell editor!')

            test_code = (
                "import numpy as np\n"
                "import pandas as pd\n"
                "import matplotlib.pyplot as plt\n"
                "import japanize_noto_sans_jp\n"
                "import openpyxl\n"
                "print('E2E_PRELOAD_SUCCESS')\n"
            )

            page.keyboard.insert_text(test_code)
            print('Inserted Python code!')

            # Press Shift+Enter
            page.keyboard.press('Shift+Enter')
            print('Pressed Shift+Enter!')

            # Poll for completion
            nb = page.locator('.jp-Notebook').first
            success = False
            for i in range(60):
                time.sleep(1)
                text = nb.inner_text()
                if 'E2E_PRELOAD_SUCCESS' in text:
                    print('Found E2E_PRELOAD_SUCCESS in text after', i+1, 'seconds!')
                    print('Full Notebook innerText:\n---')
                    print(text)
                    print('---')
                    success = True
                    break

            assert success, f'E2E_PRELOAD_SUCCESS not found in output within 60s. Last text:\n{nb.inner_text()}'
            print('SUCCESS: Cell executed and outputs printed successfully!')

            browser.close()
    finally:
        server_proc.terminate()
        server_proc.wait()

if __name__ == '__main__':
    main()
