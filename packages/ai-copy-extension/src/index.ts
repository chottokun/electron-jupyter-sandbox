import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { CodeCell, ICodeCellModel } from '@jupyterlab/cells';
import { IOutputModel } from '@jupyterlab/rendermime';
import {
  buildAIPrompt,
  buildNotebookAIPrompt,
  ErrorOutputJson,
  NotebookCellSummary
} from './prompt';

const aiCopyPlugin: JupyterFrontEndPlugin<void> = {
  id: 'electron-jupyter-ai-copy:plugin',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {

    const setupCellObserver = (cellModel: unknown, nbPanel: NotebookPanel) => {
      if (cellModel && typeof cellModel === 'object' && 'type' in cellModel && (cellModel as { type: string }).type === 'code') {
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

          const cellWidget = nbPanel.content.widgets.find(w => w.model.id === codeCellModel.id) as CodeCell | undefined;
          if (!cellWidget) return;

          attachAICopyButton(cellWidget, errorOutput, nbPanel);
        });
      }
    };

    tracker.widgetAdded.connect((sender, nbPanel: NotebookPanel) => {
      nbPanel.revealed.then(() => {
        attachNotebookToolbarButton(nbPanel);

        const cells = nbPanel.content.model?.cells;
        if (cells) {
          for (let i = 0; i < cells.length; i++) {
            setupCellObserver(cells.get(i), nbPanel);
          }
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

function getPreviousCodeCells(nbPanel: NotebookPanel, targetCellId: string, maxCells: number = 3): string[] {
  const cells = nbPanel.content.model?.cells;
  if (!cells) return [];

  const collected: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells.get(i);
    if (cell.id === targetCellId) {
      break;
    }
    if (cell.type === 'code') {
      const src = cell.sharedModel.getSource().trim();
      if (src) {
        collected.push(src);
      }
    }
  }
  return collected.slice(-maxCells);
}

function attachAICopyButton(cellWidget: CodeCell, errorOutput: IOutputModel, nbPanel: NotebookPanel) {
  const outputAreaNode = cellWidget.outputArea.node;
  const existingBtn = outputAreaNode.querySelector('.ai-copy-btn') as HTMLButtonElement | null;
  if (existingBtn) {
    // 最新のエラー出力にハンドラーを更新
    bindCopyButtonHandler(existingBtn, cellWidget, errorOutput, nbPanel);
    return;
  }

  const btn = document.createElement('button');
  btn.className = 'ai-copy-btn jp-mod-styled jp-mod-reject';
  btn.innerText = '🤖 AI用にエラーをコピー';
  btn.title = 'エラー内容と前後のコード文脈をAI質問用プロンプトとしてクリップボードへコピーします';
  btn.style.margin = '6px 0';
  btn.style.padding = '4px 10px';
  btn.style.fontSize = '12px';
  btn.style.borderRadius = '4px';
  btn.style.cursor = 'pointer';

  bindCopyButtonHandler(btn, cellWidget, errorOutput, nbPanel);
  outputAreaNode.insertBefore(btn, outputAreaNode.firstChild);
}

function bindCopyButtonHandler(
  btn: HTMLButtonElement,
  cellWidget: CodeCell,
  errorOutput: IOutputModel,
  nbPanel: NotebookPanel
) {
  btn.onclick = async () => {
    try {
      const sourceCode = cellWidget.model.sharedModel.getSource();
      const errorJson = errorOutput.toJSON() as ErrorOutputJson;
      const previousCells = getPreviousCodeCells(nbPanel, cellWidget.model.id, 3);
      const notebookName = nbPanel.context.path || undefined;

      const prompt = buildAIPrompt(sourceCode, errorJson, {
        notebookName,
        previousCells
      });

      await navigator.clipboard.writeText(prompt);
      btn.innerText = '✅ コピー完了！';
      setTimeout(() => { btn.innerText = '🤖 AI用にエラーをコピー'; }, 2500);
    } catch (err) {
      console.error('Failed to copy AI error prompt:', err);
      btn.innerText = '❌ コピー失敗';
      setTimeout(() => { btn.innerText = '🤖 AI用にエラーをコピー'; }, 2500);
    }
  };
}

function attachNotebookToolbarButton(nbPanel: NotebookPanel) {
  const toolbarNode = nbPanel.toolbar.node;
  if (toolbarNode.querySelector('.ai-copy-notebook-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'ai-copy-notebook-btn jp-ToolbarButtonComponent jp-mod-minimal jp-Button';
  btn.innerText = '🤖 AI用にノート全体をコピー';
  btn.title = 'このノートブック全体のコードと出力をAI質問用のMarkdownプロンプトとしてコピーします';
  btn.style.padding = '2px 8px';
  btn.style.marginLeft = '4px';
  btn.style.fontSize = '12px';
  btn.style.cursor = 'pointer';
  btn.style.borderRadius = '3px';
  btn.style.border = '1px solid var(--jp-border-color1, #ccc)';
  btn.style.background = 'var(--jp-layout-color1, transparent)';
  btn.style.color = 'var(--jp-ui-font-color1, inherit)';

  btn.onclick = async () => {
    try {
      const cells = nbPanel.content.model?.cells;
      const summaries: NotebookCellSummary[] = [];

      if (cells) {
        for (let i = 0; i < cells.length; i++) {
          const cell = cells.get(i);
          const source = cell.sharedModel.getSource();
          const summary: NotebookCellSummary = {
            type: cell.type,
            source
          };

          if (cell.type === 'code') {
            const codeCell = cell as ICodeCellModel;
            const textOutputs: string[] = [];
            for (let j = 0; j < codeCell.outputs.length; j++) {
              const out = codeCell.outputs.get(j);
              const raw = out.toJSON() as any;
              if (out.type === 'error') {
                summary.errorJson = raw as ErrorOutputJson;
              } else if (raw.text) {
                textOutputs.push(Array.isArray(raw.text) ? raw.text.join('') : String(raw.text));
              } else if (raw.data && raw.data['text/plain']) {
                const plain = raw.data['text/plain'];
                textOutputs.push(Array.isArray(plain) ? plain.join('') : String(plain));
              }
            }
            if (textOutputs.length > 0) {
              summary.outputText = textOutputs.join('\n');
            }
          }
          summaries.push(summary);
        }
      }

      const prompt = buildNotebookAIPrompt(summaries, nbPanel.context.path || undefined);
      await navigator.clipboard.writeText(prompt);
      btn.innerText = '✅ ノート全体をコピー完了！';
      setTimeout(() => { btn.innerText = '🤖 AI用にノート全体をコピー'; }, 2500);
    } catch (err) {
      console.error('Failed to copy full notebook prompt:', err);
      btn.innerText = '❌ コピー失敗';
      setTimeout(() => { btn.innerText = '🤖 AI用にノート全体をコピー'; }, 2500);
    }
  };

  toolbarNode.appendChild(btn);
}

export default aiCopyPlugin;
