import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { Contents, ServerConnection } from '@jupyterlab/services';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { ISignal, Signal } from '@lumino/signaling';

export class HostDrive implements Contents.IDrive {
  private _fileChanged = new Signal<this, Contents.IChangedArgs>(this);
  private _isDisposed = false;
  private _serverSettings: ServerConnection.ISettings;

  constructor(name: string = '') {
    this.name = name;
    this._serverSettings = ServerConnection.makeSettings();
  }

  readonly name: string;

  get serverSettings(): ServerConnection.ISettings {
    return this._serverSettings;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get fileChanged(): ISignal<this, Contents.IChangedArgs> {
    return this._fileChanged;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    Signal.clearData(this);
  }

  private _apiUrl(path: string): string {
    const baseUrl = this._serverSettings.baseUrl;
    const cleanPath = path.replace(/^[/\\]+/, '');
    return `${baseUrl}api/contents/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`;
  }

  async get(
    path: string,
    options?: Contents.IFetchOptions
  ): Promise<Contents.IModel> {
    const url = new URL(this._apiUrl(path));
    if (options) {
      if (options.content !== undefined) {
        url.searchParams.set('content', options.content ? '1' : '0');
      }
      if (options.type) {
        url.searchParams.set('type', options.type);
      }
      if (options.format) {
        url.searchParams.set('format', options.format);
      }
    }

    const res = await ServerConnection.makeRequest(url.toString(), {}, this._serverSettings);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Failed to fetch contents: ${res.statusText}`);
    }
    return await res.json();
  }

  getDownloadUrl(path: string): Promise<string> {
    return Promise.resolve(this._apiUrl(path));
  }

  async newUntitled(options?: Contents.ICreateOptions): Promise<Contents.IModel> {
    const path = options?.path || '';
    const url = this._apiUrl(path);
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: options?.type || 'notebook',
        ext: options?.ext || ''
      })
    };

    const res = await ServerConnection.makeRequest(url, init, this._serverSettings);
    if (!res.ok) {
      throw new Error(`Failed to create untitled: ${res.statusText}`);
    }
    const model = await res.json();
    this._fileChanged.emit({
      type: 'new',
      oldValue: null,
      newValue: model
    });
    return model;
  }

  async save(
    path: string,
    options: Partial<Contents.IModel> = {}
  ): Promise<Contents.IModel> {
    const url = this._apiUrl(path);
    const init: RequestInit = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    };

    const res = await ServerConnection.makeRequest(url, init, this._serverSettings);
    if (!res.ok) {
      throw new Error(`Failed to save content: ${res.statusText}`);
    }
    const model = await res.json();
    this._fileChanged.emit({
      type: 'save',
      oldValue: null,
      newValue: model
    });
    return model;
  }

  async delete(path: string): Promise<void> {
    const url = this._apiUrl(path);
    const init: RequestInit = { method: 'DELETE' };

    const res = await ServerConnection.makeRequest(url, init, this._serverSettings);
    if (!res.ok) {
      throw new Error(`Failed to delete item: ${res.statusText}`);
    }
    this._fileChanged.emit({
      type: 'delete',
      oldValue: { path },
      newValue: null
    });
  }

  async rename(oldPath: string, newPath: string): Promise<Contents.IModel> {
    const url = this._apiUrl(oldPath);
    const init: RequestInit = {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: newPath })
    };

    const res = await ServerConnection.makeRequest(url, init, this._serverSettings);
    if (!res.ok) {
      throw new Error(`Failed to rename item: ${res.statusText}`);
    }
    const model = await res.json();
    this._fileChanged.emit({
      type: 'rename',
      oldValue: { path: oldPath },
      newValue: model
    });
    return model;
  }

  async copy(fromPath: string, toDir: string): Promise<Contents.IModel> {
    const url = this._apiUrl(toDir);
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copy_from: fromPath })
    };

    const res = await ServerConnection.makeRequest(url, init, this._serverSettings);
    if (!res.ok) {
      throw new Error(`Failed to copy item: ${res.statusText}`);
    }
    const model = await res.json();
    this._fileChanged.emit({
      type: 'new',
      oldValue: null,
      newValue: model
    });
    return model;
  }

  async checkpointCollisions?(path: string): Promise<number> {
    return 0;
  }

  async listCheckpoints(path: string): Promise<Contents.ICheckpointModel[]> {
    const url = `${this._apiUrl(path)}/checkpoints`;
    const res = await ServerConnection.makeRequest(url, {}, this._serverSettings);
    if (!res.ok) {
      return [];
    }
    return await res.json();
  }

  async createCheckpoint(path: string): Promise<Contents.ICheckpointModel> {
    const url = `${this._apiUrl(path)}/checkpoints`;
    const init: RequestInit = { method: 'POST' };
    const res = await ServerConnection.makeRequest(url, init, this._serverSettings);
    if (!res.ok) {
      throw new Error(`Failed to create checkpoint: ${res.statusText}`);
    }
    return await res.json();
  }

  async restoreCheckpoint(path: string, checkpointId: string): Promise<void> {
    const url = `${this._apiUrl(path)}/checkpoints/${checkpointId}`;
    const init: RequestInit = { method: 'POST' };
    const res = await ServerConnection.makeRequest(url, init, this._serverSettings);
    if (!res.ok) {
      throw new Error(`Failed to restore checkpoint: ${res.statusText}`);
    }
  }

  async deleteCheckpoint(path: string, checkpointId: string): Promise<void> {
    const url = `${this._apiUrl(path)}/checkpoints/${checkpointId}`;
    const init: RequestInit = { method: 'DELETE' };
    const res = await ServerConnection.makeRequest(url, init, this._serverSettings);
    if (!res.ok) {
      throw new Error(`Failed to delete checkpoint: ${res.statusText}`);
    }
  }
}

const hostDrivePlugin: JupyterFrontEndPlugin<void> = {
  id: 'electron-jupyter-sandbox:host-drive-extension',
  autoStart: true,
  requires: [IDocumentManager, IFileBrowserFactory],
  activate: (app: JupyterFrontEnd, docManager: IDocumentManager, factory: IFileBrowserFactory) => {
    const drive = new HostDrive('');
    docManager.services.contents.addDrive(drive);
    (docManager.services.contents as any)._defaultDrive = drive;
    console.log('[HostDrive] Host Contents Drive successfully registered as primary default drive.');
  }
};

export default hostDrivePlugin;
