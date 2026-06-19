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

  // Crear tablas base si no existen
  db.prepare(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT NOT NULL,
      nombre TEXT NOT NULL,
      variante TEXT DEFAULT 'Estándar',
      unidad TEXT DEFAULT 'Unidad',
      precio_venta REAL NOT NULL,
      costo_directo REAL DEFAULT 0,
      stock_actual REAL DEFAULT 0
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'vendedor'
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
      total REAL NOT NULL,
      metodo_pago TEXT NOT NULL,
      notas TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS detalle_ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      metodo TEXT NOT NULL,
      monto REAL NOT NULL,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS cierres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      hora_cierre TEXT DEFAULT (datetime('now', 'localtime')),
      total REAL NOT NULL,
      cantidad INTEGER NOT NULL,
      por_pago TEXT NOT NULL,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `).run();

  // Migraciones automáticas (DEBEN correr ANTES del seed)
  try {
    const colVentas = db.prepare("PRAGMA table_info(ventas)").all();
    if (!colVentas.find(c => c.name === 'usuario_nombre')) {
      db.prepare("ALTER TABLE ventas ADD COLUMN usuario_nombre TEXT").run();
    }
    if (!colVentas.find(c => c.name === 'cerrado')) {
      db.prepare("ALTER TABLE ventas ADD COLUMN cerrado INTEGER DEFAULT 0").run();
    }
    if (!colVentas.find(c => c.name === 'estado')) {
      db.prepare("ALTER TABLE ventas ADD COLUMN estado TEXT DEFAULT 'completada'").run();
    }
    if (!colVentas.find(c => c.name === 'saldo_pendiente')) {
      db.prepare("ALTER TABLE ventas ADD COLUMN saldo_pendiente REAL DEFAULT 0").run();
    }
    if (!colVentas.find(c => c.name === 'fecha_cobro')) {
      db.prepare("ALTER TABLE ventas ADD COLUMN fecha_cobro TEXT").run();
    }
    if (!colVentas.find(c => c.name === 'usuario_id')) {
      db.prepare("ALTER TABLE ventas ADD COLUMN usuario_id INTEGER").run();
    }
  } catch(e) { /* tabla ventas no existe */ }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS apertura_caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      saldo_inicial REAL NOT NULL DEFAULT 0,
      hora TEXT DEFAULT (datetime('now', 'localtime')),
      cerrado INTEGER DEFAULT 0,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS cobros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      metodo TEXT NOT NULL,
      fecha TEXT DEFAULT (datetime('now', 'localtime')),
      usuario_id INTEGER,
      usuario_nombre TEXT,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS movimientos_caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      monto REAL NOT NULL,
      concepto TEXT NOT NULL,
      fecha TEXT DEFAULT (datetime('now', 'localtime')),
      usuario_id INTEGER,
      usuario_nombre TEXT,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `).run();

  try {
    const colCierres = db.prepare("PRAGMA table_info(cierres)").all();
    if (!colCierres.find(c => c.name === 'efectivo_contado')) {
      db.prepare("ALTER TABLE cierres ADD COLUMN efectivo_contado REAL DEFAULT 0").run();
    }
    if (!colCierres.find(c => c.name === 'efectivo_retiro')) {
      db.prepare("ALTER TABLE cierres ADD COLUMN efectivo_retiro REAL DEFAULT 0").run();
    }
    if (!colCierres.find(c => c.name === 'efectivo_dejado')) {
      db.prepare("ALTER TABLE cierres ADD COLUMN efectivo_dejado REAL DEFAULT 0").run();
    }
    if (!colCierres.find(c => c.name === 'total_mp')) {
      db.prepare("ALTER TABLE cierres ADD COLUMN total_mp REAL DEFAULT 0").run();
    }
    if (!colCierres.find(c => c.name === 'total_transferencia')) {
      db.prepare("ALTER TABLE cierres ADD COLUMN total_transferencia REAL DEFAULT 0").run();
    }
    if (!colCierres.find(c => c.name === 'saldo_inicial')) {
      db.prepare("ALTER TABLE cierres ADD COLUMN saldo_inicial REAL DEFAULT 0").run();
    }
    if (!colCierres.find(c => c.name === 'apertura_id')) {
      db.prepare("ALTER TABLE cierres ADD COLUMN apertura_id INTEGER").run();
      const oldCierres = db.prepare('SELECT id, usuario_id, fecha, hora_cierre FROM cierres WHERE apertura_id IS NULL').all();
      for (const cierre of oldCierres) {
        const apertura = db.prepare('SELECT id, hora FROM apertura_caja WHERE usuario_id = ? AND fecha = ? AND hora <= ? ORDER BY id DESC LIMIT 1').get(cierre.usuario_id, cierre.fecha, cierre.hora_cierre);
        if (apertura) {
          db.prepare('UPDATE cierres SET apertura_id = ? WHERE id = ?').run(apertura.id, cierre.id);
        }
      }
    }
  } catch(e) { /* tabla cierres no existe */ }

  try {
    const colProductos = db.prepare("PRAGMA table_info(productos)").all();
    if (!colProductos.find(c => c.name === 'codigo')) {
      db.prepare("ALTER TABLE productos ADD COLUMN codigo TEXT DEFAULT ''").run();
    }
    const sinCodigo = db.prepare('SELECT id FROM productos WHERE codigo = "" OR codigo IS NULL').all();
    for (const p of sinCodigo) {
      const codigo = String(p.id).padStart(3, '0');
      db.prepare('UPDATE productos SET codigo = ? WHERE id = ?').run(codigo, p.id);
    }
  } catch (e) { /* tabla productos no existe todavía */ }

  try {
    const colCobros = db.prepare("PRAGMA table_info(cobros)").all();
    if (!colCobros.find(c => c.name === 'metodo')) {
      db.prepare("ALTER TABLE cobros ADD COLUMN metodo TEXT DEFAULT 'Efectivo'").run();
    }
  } catch(e) { /* tabla cobros no existe */ }

  // Seed users if empty
  const userCount = db.prepare('SELECT COUNT(*) as c FROM usuarios').get().c;
  if (userCount === 0) {
    db.prepare('INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)').run('admin', 'admin', 'admin');
    db.prepare('INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)').run('vendedor', 'vendedor', 'vendedor');
  }

  // Seed products if empty
  const prodCount = db.prepare('SELECT COUNT(*) as c FROM productos').get().c;
  if (prodCount === 0) {
    const catalogo = [
      { cat: 'Panadería', nom: 'Chipa', precio: 2000 },
      { cat: 'Panadería', nom: 'Golfeado Mini', precio: 2100 },
      { cat: 'Panadería', nom: 'Golfeado Grande', precio: 5500 },
      { cat: 'Panadería', nom: 'Palmerita', precio: 1000 },
      { cat: 'Panadería', nom: 'Rolls Mini', precio: 2000 },
      { cat: 'Panadería', nom: 'Medialunas', precio: 1000 },
      { cat: 'Panadería', nom: 'Mini Lunch', precio: 7000 },
      { cat: 'Panadería', nom: 'Piñita', precio: 600 },
      { cat: 'Panadería', nom: 'Croissant', precio: 2000 },
      { cat: 'Panadería', nom: 'Tequeño', precio: 2800 },
      { cat: 'Panadería', nom: 'Pastelito J y Q', precio: 4200 },
      { cat: 'Panadería', nom: 'Pastelito Ricotta', precio: 4200 },
      { cat: 'Panadería', nom: 'Cachito J y Q', precio: 4700 },
      { cat: 'Panadería', nom: 'Cachito Queso Cream', precio: 4800 },
      { cat: 'Panadería', nom: 'Pan de Coco', precio: 800 },
      { cat: 'Panadería', nom: 'Pan de Queso Mini', precio: 4300 },
      { cat: 'Panadería', nom: 'Pan de Queso Grande', precio: 7500 },
      { cat: 'Panadería', nom: 'Pan Panceta y Queso', precio: 4300 },
      { cat: 'Panadería', nom: 'Pan Andino', precio: 2000 },
      { cat: 'Panadería', nom: 'Pan de Orégano', precio: 2000 },
      { cat: 'Panadería', nom: 'Pan Francés', precio: 650 },
      { cat: 'Panadería', nom: 'Pan Canilla', precio: 1500 },
      { cat: 'Panadería', nom: 'Pan de Jamón Mini', precio: 8500 },
      { cat: 'Panadería', nom: 'Pan de Manzana', precio: 4200 },
      { cat: 'Panadería', nom: 'Pan Guayaba', precio: 3200 },
      { cat: 'Panadería', nom: 'Pan Guayaba y Queso', precio: 3500 },
      { cat: 'Panadería', nom: 'Torta 3 Leches', precio: 7000 },
      { cat: 'Bebidas', nom: 'Gaseosas Vzlanas', precio: 2500 },
      { cat: 'Bebidas', nom: 'Malta', precio: 2500 },
      { cat: 'Bebidas', nom: 'Gaseosas 500mL', precio: 3200 },
      { cat: 'Bebidas', nom: 'Agua', precio: 2000 },
      { cat: 'Bebidas', nom: 'Jugo Baggio', precio: 1000 }
    ];
    const insertProd = db.prepare('INSERT INTO productos (categoria, nombre, variante, precio_venta, stock_actual, codigo) VALUES (?, ?, ?, ?, 100, ?)');
    let i = 1;
    for (const p of catalogo) {
      insertProd.run(p.cat, p.nom, 'Estándar', p.precio, String(i).padStart(3, '0'));
      i++;
    }
  }

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

  ipcMain.handle('create-sale', (_, { items, total, pagos, notas, usuario_id, usuario_nombre }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id, hora FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(usuario_id, hoy);
    if (!apertura) return { success: false, error: 'No hay caja abierta. Abrí la caja primero.' };
    const tieneCierre = db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id);
    if (tieneCierre) return { success: false, error: 'La caja ya está cerrada. Abrí una nueva jornada.' };

    const crearVenta = db.transaction(() => {
      const montoPagado = pagos.reduce((s, p) => s + p.monto, 0);
      const saldoPendiente = Math.max(0, total - montoPagado);
      const estado = saldoPendiente > 0 ? 'pendiente' : 'completada';

      const result = db.prepare(
        'INSERT INTO ventas (total, metodo_pago, notas, usuario_id, usuario_nombre, estado, saldo_pendiente) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(total, pagos.map(p => `${p.metodo}: $${p.monto}`).join('; '), notas || null, usuario_id || null, usuario_nombre || null, estado, saldoPendiente);

      const ventaId = result.lastInsertRowid;

      const insertPago = db.prepare('INSERT INTO pagos (venta_id, metodo, monto) VALUES (?, ?, ?)');
      for (const p of pagos) {
        insertPago.run(ventaId, p.metodo, p.monto);
      }
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

  ipcMain.handle('update-stock', (_, { producto_id, stock_actual, precio_venta }) => {
    if (precio_venta !== undefined) {
      db.prepare('UPDATE productos SET stock_actual = ?, precio_venta = ? WHERE id = ?').run(stock_actual, precio_venta, producto_id);
    } else {
      db.prepare('UPDATE productos SET stock_actual = ? WHERE id = ?').run(stock_actual, producto_id);
    }
    return { success: true };
  });

  ipcMain.handle('update-product', (_, { id, nombre, variante, categoria, precio_venta, stock_actual, codigo }) => {
    db.prepare('UPDATE productos SET nombre = ?, variante = ?, categoria = ?, precio_venta = ?, stock_actual = ?, codigo = ? WHERE id = ?')
      .run(nombre, variante, categoria, precio_venta, stock_actual, codigo || '', id);
    return { success: true };
  });

  ipcMain.handle('create-product', (_, { nombre, variante, categoria, precio_venta, stock_actual, codigo }) => {
    const result = db.prepare('INSERT INTO productos (nombre, variante, categoria, precio_venta, stock_actual, codigo) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nombre, variante || 'Estándar', categoria, precio_venta, stock_actual || 0, codigo || '');
    return { success: true, id: result.lastInsertRowid };
  });

  ipcMain.handle('delete-product', (_, id) => {
    db.prepare('DELETE FROM productos WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('get-sales', () => {
    return db.prepare(`
      SELECT v.id, v.fecha_hora, v.total, v.metodo_pago, v.notas,
             COUNT(dv.id) as items_count, v.saldo_pendiente, v.fecha_cobro,
             v.usuario_nombre
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
    const apertura = db.prepare('SELECT id, saldo_inicial, hora FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(usuario_id, hoy);
    const desdeApertura = apertura ? apertura.hora : '00:00:00';
    const saldoInicial = apertura ? apertura.saldo_inicial : 0;
    const aperturaId = apertura ? apertura.id : null;

    const ventas = db.prepare(`
      SELECT v.id, v.fecha_hora, v.total, v.notas,
             COUNT(dv.id) as items_count
      FROM ventas v
      LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
      WHERE v.usuario_id = ? AND v.fecha_hora >= ?
      GROUP BY v.id
      ORDER BY v.id
    `).all(usuario_id, desdeApertura);

    const totalVentas = ventas.reduce((s, v) => s + v.total, 0);

    const porPagoPagos = db.prepare(`
      SELECT p.metodo, COALESCE(SUM(p.monto), 0) as total
      FROM pagos p
      JOIN ventas v ON v.id = p.venta_id
      WHERE v.usuario_id = ? AND v.fecha_hora >= ?
      GROUP BY p.metodo
    `).all(usuario_id, desdeApertura).reduce((acc, p) => { acc[p.metodo] = p.total; return acc; }, {});

    const porPagoCobros = db.prepare(`
      SELECT c.metodo, COALESCE(SUM(c.monto), 0) as total
      FROM cobros c
      WHERE c.usuario_id = ? AND c.fecha >= ?
      GROUP BY c.metodo
    `).all(usuario_id, desdeApertura).reduce((acc, c) => { acc[c.metodo] = c.total; return acc; }, {});

    const metodos = new Set([...Object.keys(porPagoPagos), ...Object.keys(porPagoCobros)]);
    const porPago = {};
    for (const m of metodos) {
      porPago[m] = (porPagoPagos[m] || 0) + (porPagoCobros[m] || 0);
    }

    const movimientos = db.prepare(`
      SELECT id, tipo, monto, concepto, fecha
      FROM movimientos_caja
      WHERE usuario_id = ? AND fecha >= ?
      ORDER BY id DESC
    `).all(usuario_id, desdeApertura);

    const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
    const totalEgresos = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);

    const usuario = db.prepare('SELECT username FROM usuarios WHERE id = ?').get(usuario_id);

    const yaCerrado = aperturaId ? !!db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(aperturaId) : false;

    return { ventas, total: totalVentas, cantidad: ventas.length, porPago, usuario: usuario?.username || '', movimientos, totalIngresos, totalEgresos, porPagoPagos, porPagoCobros, yaCerrado, saldoInicial, aperturaId };
  });

  ipcMain.handle('confirmar-cierre', (_, { usuario_id, total, cantidad, por_pago, por_pago_ventas, por_pago_cobros, efectivo_contado, efectivo_retiro, efectivo_dejado, total_mp, total_transferencia, saldo_inicial, apertura_id }) => {
    if (!apertura_id) return { success: false, error: 'No hay caja abierta para cerrar.' };
    const existeCierre = db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura_id);
    if (existeCierre) return { success: false, error: 'Esta jornada ya fue cerrada.' };

    const hoy = new Date().toISOString().slice(0, 10);
    const detallado = {};
    const metodos = new Set([...Object.keys(por_pago_ventas || {}), ...Object.keys(por_pago_cobros || {})]);
    for (const m of metodos) {
      detallado[m] = {
        ventas: por_pago_ventas[m] || 0,
        cobros: por_pago_cobros[m] || 0,
        total: (por_pago_ventas[m] || 0) + (por_pago_cobros[m] || 0)
      };
    }
    db.prepare(`
      INSERT INTO cierres (usuario_id, fecha, total, cantidad, por_pago, efectivo_contado, efectivo_retiro, efectivo_dejado, total_mp, total_transferencia, saldo_inicial, apertura_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(usuario_id, hoy, total, cantidad, JSON.stringify(detallado), efectivo_contado || 0, efectivo_retiro || 0, efectivo_dejado || 0, total_mp || 0, total_transferencia || 0, saldo_inicial || 0, apertura_id || null);

    return { success: true };
  });

  ipcMain.handle('get-historial-cierres', () => {
    const cierres = db.prepare(`
      SELECT c.id, c.usuario_id, c.fecha, c.hora_cierre, c.total, c.cantidad, c.por_pago,
             c.efectivo_contado, c.efectivo_retiro, c.efectivo_dejado,
             c.total_mp, c.total_transferencia, c.saldo_inicial,
             c.apertura_id, u.username
      FROM cierres c
      JOIN usuarios u ON u.id = c.usuario_id
      ORDER BY c.id DESC
    `).all();

    return cierres.map(c => {
      let movimientos = [];
      let totalIngresos = 0;
      let totalEgresos = 0;
      if (c.apertura_id) {
        const apertura = db.prepare('SELECT hora FROM apertura_caja WHERE id = ?').get(c.apertura_id);
        if (apertura) {
          movimientos = db.prepare(`
            SELECT id, tipo, monto, concepto, fecha
            FROM movimientos_caja
            WHERE usuario_id = ? AND fecha >= ?
            ORDER BY id DESC
          `).all(c.usuario_id || 0, apertura.hora);
          totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
          totalEgresos = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
        }
      }
      return { ...c, movimientos, totalIngresos, totalEgresos };
    });
  });

  ipcMain.handle('get-today-total', (_, usuario_id) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id, hora FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(usuario_id, hoy);
    const desdeApertura = apertura ? apertura.hora : '00:00:00';
    const yaCerrado = apertura ? !!db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id) : false;

    const res = db.prepare(`
      SELECT COUNT(*) as cantidad, COALESCE(SUM(total), 0) as total,
             COALESCE(SUM(saldo_pendiente), 0) as saldo_pendiente
      FROM ventas
      WHERE usuario_id = ? AND fecha_hora >= ?
    `).get(usuario_id, desdeApertura);
    return { ...res, pendiente: yaCerrado ? 0 : res.total };
  });

  ipcMain.handle('cobrar-pendiente', (_, { venta_id, monto, metodo, usuario_id, usuario_nombre }) => {
    const venta = db.prepare('SELECT saldo_pendiente FROM ventas WHERE id = ?').get(venta_id);
    if (!venta) return { success: false, error: 'Venta no encontrada' };

    const nuevoSaldo = Math.max(0, venta.saldo_pendiente - monto);
    const estado = nuevoSaldo <= 0 ? 'completada' : 'pendiente';
    const fechaCobro = estado === 'completada' ? ", fecha_cobro = datetime('now','localtime')" : '';

    db.prepare(`UPDATE ventas SET estado = ?, saldo_pendiente = ?${fechaCobro} WHERE id = ?`).run(estado, nuevoSaldo, venta_id);
    db.prepare('INSERT INTO cobros (venta_id, monto, metodo, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?)').run(venta_id, monto, metodo || 'Efectivo', usuario_id || null, usuario_nombre || null);
    return { success: true, estado, nuevoSaldo };
  });

  ipcMain.handle('get-pendientes', () => {
    return db.prepare(`
      SELECT v.id, v.fecha_hora, v.total, v.saldo_pendiente, v.notas,
             u.username
      FROM ventas v
      JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.estado = 'pendiente'
      ORDER BY v.fecha_hora DESC
    `).all();
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

  ipcMain.handle('get-cobros', (_, venta_id) => {
    return db.prepare('SELECT id, monto, metodo, fecha, usuario_nombre FROM cobros WHERE venta_id = ? ORDER BY fecha ASC').all(venta_id);
  });

  ipcMain.handle('add-movimiento-caja', (_, { tipo, monto, concepto, usuario_id, usuario_nombre }) => {
    const result = db.prepare(
      'INSERT INTO movimientos_caja (tipo, monto, concepto, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?)'
    ).run(tipo, monto, concepto, usuario_id || null, usuario_nombre || null);
    return { success: true, id: result.lastInsertRowid };
  });

  ipcMain.handle('get-movimientos-caja', (_, { usuario_id }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id, hora FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(usuario_id, hoy);
    if (!apertura) return [];
    return db.prepare(`
      SELECT id, tipo, monto, concepto, fecha, usuario_nombre
      FROM movimientos_caja
      WHERE usuario_id = ? AND fecha >= ?
      ORDER BY id DESC
    `).all(usuario_id, apertura.hora);
  });

  ipcMain.handle('delete-movimiento-caja', (_, id) => {
    db.prepare('DELETE FROM movimientos_caja WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('abrir-caja', (_, { usuario_id, saldo_inicial }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO apertura_caja (usuario_id, fecha, saldo_inicial) VALUES (?, ?, ?)').run(usuario_id, hoy, saldo_inicial);
    return { success: true };
  });

  ipcMain.handle('get-apertura', (_, usuario_id) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id, saldo_inicial, hora FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(usuario_id, hoy);
    if (!apertura) return null;
    const tieneCierre = db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id);
    if (tieneCierre) return null;
    return apertura;
  });

  ipcMain.handle('get-esta-cerrado', (_, usuario_id) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(usuario_id, hoy);
    if (!apertura) return false;
    const cierre = db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id);
    return !!cierre;
  });

  ipcMain.handle('reset-database', () => {
    db.prepare('DELETE FROM detalle_ventas').run();
    db.prepare('DELETE FROM pagos').run();
    db.prepare('DELETE FROM cobros').run();
    db.prepare('DELETE FROM movimientos_caja').run();
    db.prepare('DELETE FROM ventas').run();
    db.prepare('DELETE FROM cierres').run();
    db.prepare('DELETE FROM apertura_caja').run();
    // Reset product stock to 100
    db.prepare('UPDATE productos SET stock_actual = 100').run();
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
