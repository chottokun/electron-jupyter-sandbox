import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { PageConfig } from '@jupyterlab/coreutils';

const executedSessionIds = new Set<string>();
const MAX_SYNC_FILE_SIZE = 20 * 1024 * 1024; // 20MB 上限

/**
 * プリロード状況や同期完了を画面右下にトースト通知する軽量ヘルパー
 */
function showToast(message: string, durationMs: number = 3000): HTMLElement {
  let toast = document.getElementById('sandbox-status-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sandbox-status-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '28px';
    toast.style.right = '20px';
    toast.style.zIndex = '10000';
    toast.style.padding = '8px 14px';
    toast.style.borderRadius = '6px';
    toast.style.backgroundColor = 'var(--jp-layout-color2, #2b2b2b)';
    toast.style.color = 'var(--jp-ui-font-color1, #ffffff)';
    toast.style.border = '1px solid var(--jp-border-color1, #555555)';
    toast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
    toast.style.fontSize = '12px';
    toast.style.fontFamily = 'var(--jp-ui-font-family, sans-serif)';
    toast.style.transition = 'opacity 0.25s ease';
    toast.style.pointerEvents = 'none';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';

  const prevTimer = (toast as any)._hideTimer;
  if (prevTimer) {
    clearTimeout(prevTimer);
  }
  if (durationMs > 0) {
    (toast as any)._hideTimer = setTimeout(() => {
      if (toast) toast.style.opacity = '0';
    }, durationMs);
  }
  return toast;
}

const preloadPlugin: JupyterFrontEndPlugin<void> = {
  id: 'electron-jupyter-sandbox:preload-extension',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker
  ) => {
    const getParentDir = (panel: NotebookPanel): string => {
      const nbPath = panel.context.path || '';
      const pathParts = nbPath.split('/');
      pathParts.pop();
      return pathParts.join('/');
    };

    const refreshFileBrowser = () => {
      try {
        if (app.commands.hasCommand('filebrowser:refresh')) {
          app.commands.execute('filebrowser:refresh');
        }
      } catch (err) {
        // ignore refresh errors
      }
    };

    const preloadFinishedSessionIds = new Set<string>();
    const syncingSessionIds = new Set<string>();

    /**
     * セル実行後の双方向ファイル同期 (Host <-> Pyodide MEMFS)
     */
    const runBidirectionalSync = async (panel: NotebookPanel) => {
      const session = panel.sessionContext.session;
      const kernel = session?.kernel;
      if (!kernel || kernel.name !== 'python') return;

      const sessionId = session?.id || '';
      if (!preloadFinishedSessionIds.has(sessionId) || syncingSessionIds.has(sessionId)) return;

      syncingSessionIds.add(sessionId);
      const syncScript = `
async def _sandbox_run_sync():
    import builtins
    if hasattr(builtins, "_sandbox_push_memfs_files"):
        await builtins._sandbox_push_memfs_files()
    if hasattr(builtins, "_sandbox_pull_host_files"):
        await builtins._sandbox_pull_host_files(only_new=True)

await _sandbox_run_sync()
`;

      try {
        const future = kernel.requestExecute({
          code: syncScript,
          silent: true,
          store_history: false,
          stop_on_error: false
        });
        await future.done;
        refreshFileBrowser();
      } catch (err) {
        // ignore kernel execution errors during background sync
      } finally {
        setTimeout(() => {
          syncingSessionIds.delete(sessionId);
        }, 300);
      }
    };

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

      const parentDir = getParentDir(panel);
      const baseUrl = PageConfig.getBaseUrl();

      showToast('⏳ ライブラリとローカルデータを準備中...', 0);

      // トップレベル await による確定同期実行（競合回避）およびセル実行前後の自動双方向ファイル同期フック登録
      const pyScript = `
async def _sandbox_auto_preload():
    import pyodide, piplite, importlib, os, json, base64, builtins
    from pyodide.http import pyfetch

    if not hasattr(builtins, "_sandbox_file_state"):
        builtins._sandbox_file_state = {}
    state = builtins._sandbox_file_state
    base_url = ${JSON.stringify(baseUrl)}
    parent_dir = ${JSON.stringify(parentDir)}
    dir_url = f"{base_url}api/contents/{parent_dir}".rstrip("/")
    max_size = ${MAX_SYNC_FILE_SIZE}

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

    async def _pull_host_files(only_new=False):
        try:
            resp = await pyfetch(dir_url)
            if resp.status == 200:
                data = await resp.json()
                if data.get("type") == "directory":
                    for item in data.get("content", []):
                        if item.get("type") == "file":
                            fname = item.get("name")
                            fsize = item.get("size") or 0
                            if not fname or fname.startswith(".") or fname.endswith(".ipynb") or fsize > max_size:
                                continue
                            if only_new and os.path.exists(fname):
                                continue
                            f_url = f"{dir_url}/{fname}"
                            f_resp = await pyfetch(f_url)
                            if f_resp.status == 200:
                                f_data = await f_resp.json()
                                f_content = f_data.get("content")
                                f_format = f_data.get("format")
                                if f_content is not None:
                                    if f_format == "base64":
                                        with open(fname, "wb") as f:
                                            f.write(base64.b64decode(f_content))
                                    else:
                                        with open(fname, "w", encoding="utf-8") as f:
                                            f.write(f_content)
                                    st = os.stat(fname)
                                    state[fname] = (st.st_mtime, st.st_size)
        except Exception as e:
            print(f"[Preload Warning] Host data sync failed: {e}")

    async def _push_memfs_files():
        try:
            for fname in os.listdir("."):
                if fname.startswith(".") or fname.endswith(".ipynb") or not os.path.isfile(fname):
                    continue
                try:
                    st = os.stat(fname)
                except Exception:
                    continue
                if st.st_size > max_size:
                    continue
                prev = state.get(fname)
                if prev is None or st.st_mtime > prev[0] + 1e-4 or st.st_size != prev[1]:
                    with open(fname, "rb") as f:
                        raw = f.read()
                    is_binary = b"\\x00" in raw
                    if not is_binary:
                        try:
                            text_val = raw.decode("utf-8")
                            payload = {"type": "file", "format": "text", "content": text_val}
                        except UnicodeDecodeError:
                            is_binary = True
                    if is_binary:
                        b64_val = base64.b64encode(raw).decode("ascii")
                        payload = {"type": "file", "format": "base64", "content": b64_val}

                    put_url = f"{dir_url}/{fname}"
                    resp = await pyfetch(
                        put_url,
                        method="PUT",
                        headers={"Content-Type": "application/json"},
                        body=json.dumps(payload)
                    )
                    if resp.status in (200, 201):
                        st_after = os.stat(fname)
                        state[fname] = (st_after.st_mtime, st_after.st_size)
        except Exception as e:
            print(f"[Sync Warning] MEMFS to Host sync error: {e}")

    builtins._sandbox_pull_host_files = _pull_host_files
    builtins._sandbox_push_memfs_files = _push_memfs_files

    # IPython post_run_cell フックへ自動登録（セル実行直後に確実にホストへ書き戻し＆新規ファイル取り込み）
    try:
        import IPython, asyncio
        ip = IPython.get_ipython()
        if ip is not None and not getattr(builtins, "_sandbox_hook_registered", False):
            def _on_post_run_cell(result):
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        loop.create_task(_push_memfs_files())
                        loop.create_task(_pull_host_files(only_new=True))
                except Exception:
                    pass
            ip.events.register("post_run_cell", _on_post_run_cell)
            builtins._sandbox_hook_registered = True
    except Exception as e:
        print(f"[Preload Warning] IPython hook registration failed: {e}")

    # 初回データロードと、プリロード前に既にMEMFSに作成されていたファイルの書き戻し
    await _pull_host_files(only_new=False)
    await _push_memfs_files()
    importlib.invalidate_caches()

await _sandbox_auto_preload()
`;

      const future = kernel.requestExecute({
        code: pyScript,
        silent: true,
        stop_on_error: false
      });

      future.done.then(() => {
        preloadFinishedSessionIds.add(sessionId);
        console.log('[Preload] パッケージおよびホストデータのプリロードが完了しました:', { pyodidePackages, piplitePackages });
        showToast('✅ ライブラリとデータの準備が完了しました', 2500);
        refreshFileBrowser();
      }).catch(() => {
        preloadFinishedSessionIds.add(sessionId);
        showToast('⚠️ プリロード中に一部警告が発生しました', 3000);
      });
    };

    tracker.widgetAdded.connect((sender, nbPanel) => {
      nbPanel.sessionContext.ready.then(() => runPreload(nbPanel));

      nbPanel.sessionContext.kernelChanged.connect(() => runPreload(nbPanel));

      let wasBusy = false;
      nbPanel.sessionContext.statusChanged.connect((_, status) => {
        if (status === 'restarting' || status === 'autorestarting') {
          const sid = nbPanel.sessionContext.session?.id || '';
          executedSessionIds.delete(sid);
          preloadFinishedSessionIds.delete(sid);
          wasBusy = false;
        } else if (status === 'busy') {
          const sid = nbPanel.sessionContext.session?.id || '';
          if (!syncingSessionIds.has(sid)) {
            wasBusy = true;
          }
        } else if (status === 'idle') {
          const sessionId = nbPanel.sessionContext.session?.id || '';
          if (!executedSessionIds.has(sessionId)) {
            runPreload(nbPanel);
          } else if (wasBusy && preloadFinishedSessionIds.has(sessionId) && !syncingSessionIds.has(sessionId)) {
            wasBusy = false;
            runBidirectionalSync(nbPanel);
          }
        }
      });
    });
  }
};

export default preloadPlugin;
