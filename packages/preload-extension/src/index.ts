import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { PageConfig } from '@jupyterlab/coreutils';

const executedSessionIds = new Set<string>();

const preloadPlugin: JupyterFrontEndPlugin<void> = {
  id: 'electron-jupyter-sandbox:preload-extension',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {
    const runPreload = async (panel: NotebookPanel) => {
      const sessionContext = panel.sessionContext;
      await sessionContext.ready;

      const kernel = sessionContext.session?.kernel;
      if (!kernel || kernel.name !== 'python') return;

      const sessionId = sessionContext.session?.id || '';
      if (executedSessionIds.has(sessionId)) return;
      executedSessionIds.add(sessionId);

      // jupyter-config-data から設定を取得
      let pyodidePackages: string[] = [];
      let piplitePackages: string[] = [];
      // 多層防御: パッケージ名が正規表現に合致するもののみ許可
      const sanitizeList = (list: unknown): string[] => {
        if (!Array.isArray(list)) return [];
        return list.filter((name): name is string =>
          typeof name === 'string' &&
          name.length > 0 &&
          name.length <= 100 &&
          /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(name)
        );
      };

      try {
        const raw = PageConfig.getOption('litePluginSettings') || PageConfig.getOption('settingsOverrides');
        if (raw) {
          const settings = JSON.parse(raw);
          const kSettings = settings['@jupyterlite/pyodide-kernel-extension:kernel'] || {};
          pyodidePackages = sanitizeList(kSettings.loadPyodideOptions?.packages);
          piplitePackages = sanitizeList(kSettings.piplitePreloadPackages);
        }
      } catch (err) {
        console.warn('[Preload] 設定のパースに失敗しました:', err);
      }

      // 設定が空の場合の安全なフォールバック
      if (pyodidePackages.length === 0 && piplitePackages.length === 0) {
        pyodidePackages = ['matplotlib'];
        piplitePackages = ['japanize-noto-sans-jp', 'openpyxl'];
      }

      // トップレベル await による確定同期実行（競合回避）
      const pyScript = `
async def _sandbox_auto_preload():
    import pyodide, piplite, importlib
    py_pkgs = ${JSON.stringify(pyodidePackages)}
    pip_pkgs = ${JSON.stringify(piplitePackages)}
    if py_pkgs:
        try:
            await pyodide.loadPackage(py_pkgs)
        except Exception as e:
            print(f"[Preload Warning] Pyodide loadPackage failed: {e}")
    if pip_pkgs:
        try:
            await piplite.install(pip_pkgs, keep_going=True)
        except Exception as e:
            print(f"[Preload Warning] Piplite install failed: {e}")
    importlib.invalidate_caches()

await _sandbox_auto_preload()
`;

      const future = kernel.requestExecute({
        code: pyScript,
        silent: true,
        stop_on_error: false
      });

      future.done.then(() => {
        console.log('[Preload] パッケージのプリロードが完了しました:', { pyodidePackages, piplitePackages });
      });
    };

    tracker.widgetAdded.connect((sender, nbPanel) => {
      nbPanel.sessionContext.ready.then(() => runPreload(nbPanel));

      nbPanel.sessionContext.kernelChanged.connect(() => runPreload(nbPanel));

      nbPanel.sessionContext.statusChanged.connect((_, status) => {
        if (status === 'restarting' || status === 'autorestarting') {
          executedSessionIds.delete(nbPanel.sessionContext.session?.id || '');
        } else if (status === 'idle') {
          runPreload(nbPanel);
        }
      });
    });
  }
};

export default preloadPlugin;
