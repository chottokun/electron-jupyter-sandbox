const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ElectronApp', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultName, data) => ipcRenderer.invoke('dialog:saveFile', { defaultName, data }),
  isElectron: true
});
