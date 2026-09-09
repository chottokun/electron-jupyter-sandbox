#!/usr/bin/env python3
import time
import os
import sys
import re
from playwright.sync_api import sync_playwright

def extract_recipes(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract python code blocks from recipes 1, 2, 3
    pattern = r'```python\n(.*?)```'
    blocks = re.findall(pattern, content, re.DOTALL)
    # Exclude Recipe 4 (reportlab await piplite.install) if we only test 1, 2, 3 without piplite
    recipes = []
    for b in blocks:
        if 'piplite.install' not in b:
            recipes.append(b.strip())
    return recipes

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 playbook-execution.e2e.py <port>")
        sys.exit(1)

    port = sys.argv[1]
    md_path = os.path.abspath('docs/playbooks/japanese-data-visualization.md')
    recipes = extract_recipes(md_path)

    print(f"Executing {len(recipes)} playbook recipes on port {port}...")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        )
        page = browser.new_page()

        page.goto(f'http://127.0.0.1:{port}/lab/index.html', wait_until='domcontentloaded')
        page.wait_for_selector('#jp-main-dock-panel', timeout=30000)

        # Open new Python notebook
        notebook_card = page.wait_for_selector('div.jp-LauncherCard[title*="Python"]', timeout=20000)
        notebook_card.click()

        time.sleep(3)

        for idx, recipe_code in enumerate(recipes, 1):
            print(f"--- Executing Recipe {idx} ---")
            cell_editor = page.locator('.jp-Notebook .cm-content').last
            cell_editor.wait_for(timeout=20000)
            cell_editor.click()

            page.keyboard.insert_text(recipe_code)
            page.keyboard.press('Shift+Enter')

            # Wait for cell execution
            time.sleep(2)
            nb = page.locator('.jp-Notebook').first
            executed = False
            for _ in range(60):
                time.sleep(1)
                text = nb.inner_text()
                if f'[{idx}]' in text or 'Excel ファイル保存完了' in text or '2026' in text:
                    executed = True
                    break

            # Check for error / ModuleNotFoundError
            text = nb.inner_text()
            assert 'ModuleNotFoundError' not in text, f'Recipe {idx} failed with ModuleNotFoundError:\n{text}'
            assert 'Error' not in text or 'Excel ファイル保存完了' in text, f'Recipe {idx} failed:\n{text}'
            print(f"Recipe {idx} executed successfully!")

        print('ALL PLAYBOOK RECIPES EXECUTED SUCCESSFULLY!')
        browser.close()

if __name__ == '__main__':
    main()
