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

  ipcMain.handle('create-sale', (_, { items, total, metodo_pago, notas, usuario_id }) => {
    const crearVenta = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO ventas (total, metodo_pago, notas, usuario_id) VALUES (?, ?, ?, ?)'
      ).run(total, metodo_pago, notas || null, usuario_id || null);

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

  ipcMain.handle('get-users', () => {
    return db.prepare('SELECT id, username, rol FROM usuarios ORDER BY id').all();
  });

  ipcMain.handle('create-user', (_, { username, password, rol }) => {
    try {
      db.prepare('INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)').run(username, password, rol);
      return { success: true };
    } catch (err) {
      if (err.message.includes('UNIQUE')) return { success: false, error: 'El usuario ya existe' };
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-user', (_, userId) => {
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(userId);
    return { success: true };
  });

  ipcMain.handle('get-cierre', (_, { usuario_id }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const ventas = db.prepare(`
      SELECT v.id, v.fecha_hora, v.total, v.metodo_pago, v.notas,
             COUNT(dv.id) as items_count
      FROM ventas v
      LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
      WHERE v.usuario_id = ? AND DATE(v.fecha_hora) = ? AND v.cerrado = 0
      GROUP BY v.id
      ORDER BY v.id
    `).all(usuario_id, hoy);

    const total = ventas.reduce((s, v) => s + v.total, 0);
    const porPago = {};
    for (const v of ventas) {
      porPago[v.metodo_pago] = (porPago[v.metodo_pago] || 0) + v.total;
    }

    const usuario = db.prepare('SELECT username FROM usuarios WHERE id = ?').get(usuario_id);

    return { ventas, total, cantidad: ventas.length, porPago, usuario: usuario?.username || '' };
  });

  ipcMain.handle('confirmar-cierre', (_, { usuario_id, total, cantidad, por_pago }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const hacerCierre = db.transaction(() => {
      db.prepare(`
        INSERT INTO cierres (usuario_id, fecha, total, cantidad, por_pago)
        VALUES (?, ?, ?, ?, ?)
      `).run(usuario_id, hoy, total, cantidad, JSON.stringify(por_pago));

      db.prepare(`
        UPDATE ventas SET cerrado = 1
        WHERE usuario_id = ? AND DATE(fecha_hora) = ? AND cerrado = 0
      `).run(usuario_id, hoy);
    });
    hacerCierre();
    return { success: true };
  });

  ipcMain.handle('get-historial-cierres', () => {
    return db.prepare(`
      SELECT c.id, c.fecha, c.hora_cierre, c.total, c.cantidad, c.por_pago,
             u.username
      FROM cierres c
      JOIN usuarios u ON u.id = c.usuario_id
      ORDER BY c.id DESC
    `).all();
  });

  ipcMain.handle('get-today-total', (_, usuario_id) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const res = db.prepare(`
      SELECT COUNT(*) as cantidad, COALESCE(SUM(total), 0) as total
      FROM ventas
      WHERE usuario_id = ? AND DATE(fecha_hora) = ? AND cerrado = 0
    `).get(usuario_id, hoy);
    return res;
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
