const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ElectronApp', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultName, data) => ipcRenderer.invoke('dialog:saveFile', { defaultName, data }),
  onFileImported: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:file-imported', listener);
    return () => ipcRenderer.removeListener('app:file-imported', listener);
  },
  onRequestExportData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:request-export-data', listener);
    return () => ipcRenderer.removeListener('app:request-export-data', listener);
  },
  completeExportFile: (targetPath, content, format) =>
    ipcRenderer.invoke('dialog:completeExportFile', { targetPath, content, format }),
  isElectron: true
});
