export interface ErrorOutputJson {
  traceback?: string[];
  ename?: string;
  evalue?: string;
}

export interface AIPromptContextOptions {
  notebookName?: string;
  previousCells?: string[];
}

export interface NotebookCellSummary {
  type: 'code' | 'markdown' | 'raw' | string;
  source: string;
  outputText?: string;
  errorJson?: ErrorOutputJson;
}

export function formatTraceback(errorJson: ErrorOutputJson): string {
  if (Array.isArray(errorJson?.traceback)) {
    return errorJson.traceback.join('\n').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
  }
  return `${errorJson?.ename || 'Error'}: ${errorJson?.evalue || ''}`;
}

export function buildAIPrompt(
  sourceCode: string,
  errorJson: ErrorOutputJson,
  options?: AIPromptContextOptions
): string {
  const traceback = formatTraceback(errorJson);
  const lines: string[] = [
    '以下のJupyter (Python/Pyodide WASM) 環境でコード実行時にエラーが発生しました。',
    '原因の解説と、修正したコードを提示してください。'
  ];

  if (options?.notebookName) {
    lines.push('', `【対象ノートブック】 ${options.notebookName}`);
  }

  const prevCells = (options?.previousCells || []).map(c => c.trim()).filter(Boolean);
  if (prevCells.length > 0) {
    lines.push(
      '',
      '【直前のセルの文脈（定義済み変数・インポート等）】',
      '```python',
      prevCells.join('\n\n# --- 次のセル ---\n\n'),
      '```'
    );
  }

  lines.push(
    '',
    '【実行コード】',
    '```python',
    sourceCode,
    '```',
    '',
    '【エラー内容 / トレースバック】',
    '```text',
    traceback,
    '```'
  );

  return lines.join('\n');
}

export function buildNotebookAIPrompt(
  cells: NotebookCellSummary[],
  notebookName?: string
): string {
  const lines: string[] = [
    '以下は Jupyter (Python/Pyodide WASM) 環境で作成中のノートブック全体の内容です。',
    'コードのレビュー、改善案の提示、または続きの実装をサポートしてください。'
  ];

  if (notebookName) {
    lines.push('', `【ノートブック名】 ${notebookName}`);
  }

  cells.forEach((cell, idx) => {
    const src = (cell.source || '').trim();
    if (!src) return;

    lines.push('', `### セル ${idx + 1} (${cell.type})`);
    if (cell.type === 'markdown') {
      lines.push('```markdown', src, '```');
    } else {
      lines.push('```python', src, '```');
    }

    if (cell.errorJson) {
      lines.push('【エラー出力】', '```text', formatTraceback(cell.errorJson), '```');
    } else if (cell.outputText && cell.outputText.trim()) {
      const trimmedOut = cell.outputText.trim();
      const maxLen = 1000;
      const displayOut = trimmedOut.length > maxLen
        ? `${trimmedOut.slice(0, maxLen)}\n... (省略)`
        : trimmedOut;
      lines.push('【実行出力】', '```text', displayOut, '```');
    }
  });

  return lines.join('\n');
}
