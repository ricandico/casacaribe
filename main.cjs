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

  ipcMain.handle('get-sales', () => {
    return db.prepare(`
      SELECT v.id, v.fecha_hora, v.total, v.metodo_pago, v.notas,
             COUNT(dv.id) as items_count
      FROM ventas v
      LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
      GROUP BY v.id
      ORDER BY v.id DESC
    `).all();
  });

  ipcMain.handle('login', (_, { username, password }) => {
    const user = db.prepare(
      'SELECT id, username, rol FROM usuarios WHERE username = ? AND password = ?'
    ).get(username, password);
    return user || null;
  });

  ipcMain.handle('get-sale-detail', (_, saleId) => {
    return db.prepare(`
      SELECT dv.cantidad, dv.precio_unitario, dv.subtotal,
             p.nombre, p.variante
      FROM detalle_ventas dv
      JOIN productos p ON p.id = dv.producto_id
      WHERE dv.venta_id = ?
      ORDER BY dv.id
    `).all(saleId);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});
