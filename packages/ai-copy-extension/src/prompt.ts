export interface ErrorOutputJson {
  traceback?: string[];
  ename?: string;
  evalue?: string;
}

export function formatTraceback(errorJson: ErrorOutputJson): string {
  if (Array.isArray(errorJson?.traceback)) {
    return errorJson.traceback.join('\n').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
  }
  return `${errorJson?.ename || 'Error'}: ${errorJson?.evalue || ''}`;
}

export function buildAIPrompt(sourceCode: string, errorJson: ErrorOutputJson): string {
  const traceback = formatTraceback(errorJson);

  return [
    '以下のJupyter (Python/Pyodide WASM) 環境でコード実行時にエラーが発生しました。',
    '原因の解説と、修正したコードを提示してください。',
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
  ].join('\n');
}
