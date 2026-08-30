import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { CodeCell, ICodeCellModel } from '@jupyterlab/cells';
import { IOutputModel } from '@jupyterlab/rendermime';

const aiCopyPlugin: JupyterFrontEndPlugin<void> = {
  id: 'electron-jupyter-ai-copy:plugin',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {

    const setupCellObserver = (cellModel: any, nbPanel: NotebookPanel) => {
      if (cellModel.type === 'code') {
        const codeCellModel = cellModel as ICodeCellModel;
        codeCellModel.outputs.changed.connect((outputsList) => {
          let errorOutput: IOutputModel | undefined;
          for (let i = 0; i < outputsList.length; i++) {
            const out = outputsList.get(i);
            if (out.type === 'error') {
              errorOutput = out;
              break;
            }
          }
          if (!errorOutput) return;

          const cellWidget = nbPanel.content.widgets.find(w => w.model.id === cellModel.id) as CodeCell;
          if (!cellWidget) return;

          attachAICopyButton(cellWidget, errorOutput);
        });
      }
    };

    tracker.widgetAdded.connect((sender, nbPanel: NotebookPanel) => {
      nbPanel.revealed.then(() => {
        const cells = nbPanel.content.model?.cells;
        if (cells) {
          // 既存セルの登録
          for (let i = 0; i < cells.length; i++) {
            setupCellObserver(cells.get(i), nbPanel);
          }
          // 追加セルの登録
          cells.changed.connect((_, change) => {
            if (change.type === 'add') {
              change.newValues.forEach(cellModel => {
                setupCellObserver(cellModel, nbPanel);
              });
            }
          });
        }
      });
    });
  }
};

function attachAICopyButton(cellWidget: CodeCell, errorOutput: IOutputModel) {
  const outputAreaNode = cellWidget.outputArea.node;
  if (outputAreaNode.querySelector('.ai-copy-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'ai-copy-btn jp-mod-styled jp-mod-reject';
  btn.innerText = '🤖 AI用にエラーをコピー';
  btn.style.margin = '6px 0';
  btn.style.padding = '4px 10px';
  btn.style.fontSize = '12px';
  btn.style.borderRadius = '4px';
  btn.style.cursor = 'pointer';

  btn.onclick = async () => {
    // ボタンクリック時点で最新のコードを取得
    const sourceCode = cellWidget.model.sharedModel.getSource();

    const errorJson = errorOutput.toJSON() as any;
    // トレースバックの整形（ANSIカラーコードを除去）
    const traceback = Array.isArray(errorJson?.traceback)
      ? errorJson.traceback.join('\n').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
      : `${errorJson?.ename || 'Error'}: ${errorJson?.evalue || ''}`;

    const prompt = [
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

    await navigator.clipboard.writeText(prompt);
    btn.innerText = '✅ コピー完了！';
    setTimeout(() => { btn.innerText = '🤖 AI用にエラーをコピー'; }, 2500);
  };

  outputAreaNode.insertBefore(btn, outputAreaNode.firstChild);
}

export default aiCopyPlugin;
