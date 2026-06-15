const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getCategories: () => ipcRenderer.invoke('get-categories'),
  getProductsByCategory: (category) => ipcRenderer.invoke('get-products-by-category', category),
  createSale: (data) => ipcRenderer.invoke('create-sale', data),
});
