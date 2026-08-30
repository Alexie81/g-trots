// Expose ipcRenderer for Excel save dialog
const { ipcRenderer } = require('electron');
window.saveExcel = (defaultName, buffer) => ipcRenderer.invoke('save-excel', { defaultName, buffer });
window.savePdf = (defaultName, buffer) => ipcRenderer.invoke('save-pdf', { defaultName, buffer });
window.saveRemoteFiles = (files) => ipcRenderer.invoke('save-remote-files', { files });
window.preparePdfAttachment = (defaultName, buffer) => ipcRenderer.invoke('prepare-pdf-attachment', { defaultName, buffer });
window.sendWhatsAppDocument = (payload) => ipcRenderer.invoke('send-whatsapp-document', payload);
window.onRenderingMode = (callback) => {
  const listener = (_event, mode) => callback(mode);
  ipcRenderer.on('rendering-mode', listener);
  return () => ipcRenderer.removeListener('rendering-mode', listener);
};
window.desktopUpdater = {
  getState: () => ipcRenderer.invoke('app-update:get-state'),
  check: () => ipcRenderer.invoke('app-update:check'),
  download: () => ipcRenderer.invoke('app-update:download'),
  install: () => ipcRenderer.invoke('app-update:install'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('app-update-state', listener);
    return () => ipcRenderer.removeListener('app-update-state', listener);
  },
  onOpenDialog: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app-update-open-dialog', listener);
    return () => ipcRenderer.removeListener('app-update-open-dialog', listener);
  },
};
