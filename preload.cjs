const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getCategories: () => ipcRenderer.invoke('get-categories'),
  getProductsByCategory: (category) => ipcRenderer.invoke('get-products-by-category', category),
  getAllProducts: () => ipcRenderer.invoke('get-all-products'),
  createSale: (data) => ipcRenderer.invoke('create-sale', data),
  updateStock: (data) => ipcRenderer.invoke('update-stock', data),
  getSales: () => ipcRenderer.invoke('get-sales'),
  getSaleDetail: (saleId) => ipcRenderer.invoke('get-sale-detail', saleId),
  login: (data) => ipcRenderer.invoke('login', data),
});
