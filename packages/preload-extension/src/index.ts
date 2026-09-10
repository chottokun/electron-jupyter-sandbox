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

      const nbPath = panel.context.path || '';
      const pathParts = nbPath.split('/');
      pathParts.pop();
      const parentDir = pathParts.join('/');
      const baseUrl = PageConfig.getBaseUrl();

      // トップレベル await による確定同期実行（競合回避）
      const pyScript = `
async def _sandbox_auto_preload():
    import pyodide, piplite, importlib, os, json
    from pyodide.http import pyfetch

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

    # カレントディレクトリのデータファイルを MEMFS へ透過ロード
    try:
        dir_url = f"${baseUrl}api/contents/${parentDir}".rstrip("/")
        resp = await pyfetch(dir_url)
        if resp.status == 200:
            data = await resp.json()
            if data.get("type") == "directory":
                for item in data.get("content", []):
                    if item.get("type") == "file":
                        fname = item.get("name")
                        if fname and not fname.startswith("."):
                            f_url = f"{dir_url}/{fname}"
                            f_resp = await pyfetch(f_url)
                            if f_resp.status == 200:
                                f_data = await f_resp.json()
                                f_content = f_data.get("content")
                                f_format = f_data.get("format")
                                if f_content is not None:
                                    if f_format == "base64":
                                        import base64
                                        with open(fname, "wb") as f:
                                            f.write(base64.b64decode(f_content))
                                    else:
                                        with open(fname, "w", encoding="utf-8") as f:
                                            f.write(f_content)
    except Exception as e:
        print(f"[Preload Warning] Host data sync failed: {e}")

    importlib.invalidate_caches()

await _sandbox_auto_preload()
`;

      const future = kernel.requestExecute({
        code: pyScript,
        silent: true,
        stop_on_error: false
      });

      future.done.then(() => {
        console.log('[Preload] パッケージおよびホストデータのプリロードが完了しました:', { pyodidePackages, piplitePackages });
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
