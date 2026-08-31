/**
 * Removes ANSI color codes from a traceback array and joins lines
 * @param traceback Array of traceback lines with ANSI escape sequences
 * @returns Cleaned traceback string
 */
export function cleanTraceback(traceback: string[]): string {
  if (Array.isArray(traceback)) {
    return traceback.join('\n').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
  }
  return '';
}

export interface ErrorJson {
  traceback?: string[];
  ename?: string;
  evalue?: string;
}

/**
 * Formats an AI error prompt given source code and error JSON object
 * @param sourceCode Code executed in Jupyter
 * @param errorJson Error output object containing traceback or ename/evalue
 * @returns Markdown formatted prompt for AI models
 */
export function formatAIPrompt(sourceCode: string, errorJson: ErrorJson): string {
  const traceback = Array.isArray(errorJson?.traceback)
    ? cleanTraceback(errorJson.traceback)
    : `${errorJson?.ename || 'Error'}: ${errorJson?.evalue || ''}`;

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
