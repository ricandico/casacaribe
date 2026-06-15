const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

let db;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  db = new Database('panaderia.db');

  createWindow();

  ipcMain.handle('get-categories', () => {
    return db.prepare('SELECT DISTINCT categoria FROM productos ORDER BY categoria').all();
  });

  ipcMain.handle('get-products-by-category', (_, category) => {
    if (category === 'Todas') {
      return db.prepare('SELECT * FROM productos ORDER BY categoria, nombre').all();
    }
    return db.prepare('SELECT * FROM productos WHERE categoria = ? ORDER BY nombre').all(category);
  });

  ipcMain.handle('get-all-products', () => {
    return db.prepare('SELECT * FROM productos ORDER BY categoria, nombre').all();
  });

  ipcMain.handle('create-sale', (_, { items, total, metodo_pago, notas }) => {
    const crearVenta = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO ventas (total, metodo_pago, notas) VALUES (?, ?, ?)'
      ).run(total, metodo_pago, notas || null);

      const ventaId = result.lastInsertRowid;
      const insertDetail = db.prepare(
        'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
      );

      const descontarStock = db.prepare(
        'UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?'
      );

      for (const item of items) {
        insertDetail.run(ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal);
        descontarStock.run(item.cantidad, item.producto_id);
      }

      return { ventaId };
    });

    return crearVenta();
  });

  ipcMain.handle('update-stock', (_, { producto_id, stock_actual }) => {
    db.prepare('UPDATE productos SET stock_actual = ? WHERE id = ?').run(stock_actual, producto_id);
    return { success: true };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});
