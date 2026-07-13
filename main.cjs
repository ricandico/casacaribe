const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
let mainWindow;

function getDbPath() {
  const appDataPath = app.getPath('userData');
  const dbPath = path.join(appDataPath, 'panaderia.db');
  // Si no existe en AppData, copiar desde la carpeta de la app
  if (!fs.existsSync(dbPath)) {
    const localDb = path.join(__dirname, 'panaderia.db');
    if (fs.existsSync(localDb)) {
      fs.copyFileSync(localDb, dbPath);
    }
  }
  return dbPath;
}

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
  db = new Database(getDbPath());

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
    if (!colVentas.find(c => c.name === 'descuento')) {
      db.prepare("ALTER TABLE ventas ADD COLUMN descuento REAL DEFAULT 0").run();
    }
    if (!colVentas.find(c => c.name === 'total_con_descuento')) {
      db.prepare("ALTER TABLE ventas ADD COLUMN total_con_descuento REAL DEFAULT 0").run();
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

  db.prepare(`
    CREATE TABLE IF NOT EXISTS descartes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      cantidad REAL NOT NULL,
      motivo TEXT,
      fecha TEXT DEFAULT (datetime('now', 'localtime')),
      usuario_id INTEGER,
      usuario_nombre TEXT,
      FOREIGN KEY (producto_id) REFERENCES productos(id),
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

  // === TABLAS DE CONTABILIDAD ===
  db.prepare(`
    CREATE TABLE IF NOT EXISTS categorias_gasto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      icono TEXT DEFAULT '📦'
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monto REAL NOT NULL,
      fecha TEXT NOT NULL,
      categoria_id INTEGER NOT NULL,
      concepto TEXT NOT NULL,
      proveedor TEXT DEFAULT '',
      recurrente INTEGER DEFAULT 0,
      notas TEXT DEFAULT '',
      fecha_registro TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (categoria_id) REFERENCES categorias_gasto(id)
    )
  `).run();

  // Seed categorías de gasto por defecto si están vacías
  const catGastoCount = db.prepare('SELECT COUNT(*) as c FROM categorias_gasto').get().c;
  if (catGastoCount === 0) {
    const catsDefault = [
      { nombre: 'Materia Prima', icono: '🌾' },
      { nombre: 'Servicios', icono: '💡' },
      { nombre: 'Alquiler', icono: '🏠' },
      { nombre: 'Sueldos', icono: '👥' },
      { nombre: 'Impuestos', icono: '📄' },
      { nombre: 'Mantenimiento', icono: '🔧' },
      { nombre: 'Transporte', icono: '🚛' },
      { nombre: 'Packaging', icono: '📦' },
      { nombre: 'Limpieza', icono: '🧹' },
      { nombre: 'Marketing', icono: '📢' },
      { nombre: 'Seguros', icono: '🛡️' },
      { nombre: 'Equipamiento', icono: '⚙️' },
      { nombre: 'Otros', icono: '📎' }
    ];
    const insertCat = db.prepare('INSERT INTO categorias_gasto (nombre, icono) VALUES (?, ?)');
    for (const c of catsDefault) {
      insertCat.run(c.nombre, c.icono);
    }
  }

  createWindow();

  ipcMain.handle('get-categories', () => {
    const cats = db.prepare('SELECT DISTINCT categoria FROM productos ORDER BY categoria').all();
    // Siempre incluir categorías base
    const base = ['Panadería', 'Pastelería', 'Facturas', 'Salado', 'Bebidas', 'Otros'];
    const existentes = new Set(cats.map(c => c.categoria));
    for (const c of base) {
      if (!existentes.has(c)) cats.push({ categoria: c });
    }
    return cats.sort((a, b) => a.categoria.localeCompare(b.categoria));
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

  ipcMain.handle('create-sale', (_, { items, total, descuento, total_con_descuento, pagos, notas, usuario_id, usuario_nombre }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id, hora FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(usuario_id, hoy);
    if (!apertura) return { success: false, error: 'No hay caja abierta. Abrí la caja primero.' };
    const tieneCierre = db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id);
    if (tieneCierre) return { success: false, error: 'La caja ya está cerrada. Abrí una nueva jornada.' };

    const crearVenta = db.transaction(() => {
      const montoPagado = pagos.reduce((s, p) => s + p.monto, 0);
      const totalFinal = total_con_descuento || Math.max(0, (total || 0) - (descuento || 0));
      const saldoPendiente = Math.max(0, totalFinal - montoPagado);
      const estado = saldoPendiente > 0 ? 'pendiente' : 'completada';

      const result = db.prepare(
        'INSERT INTO ventas (total, metodo_pago, notas, usuario_id, usuario_nombre, estado, saldo_pendiente, descuento, total_con_descuento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(total, pagos.map(p => `${p.metodo}: $${p.monto}`).join('; '), notas || null, usuario_id || null, usuario_nombre || null, estado, saldoPendiente, descuento || 0, totalFinal);

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
    // Validar que no exista un producto con el mismo nombre
    const existente = db.prepare('SELECT id, codigo FROM productos WHERE nombre = ?').get(nombre);
    if (existente) {
      return { success: false, error: `Ya existe un producto con ese nombre (código: ${existente.codigo})` };
    }

    // Si no se envía código, generar el siguiente incremental basado en el código más alto
    if (!codigo) {
      const lastProd = db.prepare("SELECT codigo FROM productos WHERE codigo != '' AND codigo IS NOT NULL ORDER BY CAST(codigo AS INTEGER) DESC LIMIT 1").get();
      let nextNum = 1;
      if (lastProd && lastProd.codigo) {
        const num = parseInt(lastProd.codigo, 10);
        if (!isNaN(num)) nextNum = num + 1;
      }
      codigo = String(nextNum).padStart(3, '0');
    }
    const result = db.prepare('INSERT INTO productos (nombre, variante, categoria, precio_venta, stock_actual, codigo) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nombre, variante || 'Estándar', categoria, precio_venta, stock_actual || 0, codigo);
    return { success: true, id: result.lastInsertRowid, codigo };
  });

  ipcMain.handle('delete-product', (_, id) => {
    db.prepare('DELETE FROM productos WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('get-sales', (_, { usuario_id, rol }) => {
    let query = `
      SELECT v.id, v.fecha_hora, v.total, v.metodo_pago, v.notas,
             COUNT(dv.id) as items_count, v.saldo_pendiente, v.fecha_cobro,
             v.usuario_nombre, v.descuento, v.total_con_descuento
      FROM ventas v
      LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
    `;
    if (rol !== 'admin') {
      query += ` WHERE v.usuario_id = ? `;
    }
    query += ` GROUP BY v.id ORDER BY v.id DESC`;
    if (rol !== 'admin') {
      return db.prepare(query).all(usuario_id);
    }
    return db.prepare(query).all();
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

  ipcMain.handle('change-password', (_, { userId, newPassword }) => {
    db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(newPassword, userId);
    return { success: true };
  });

  ipcMain.handle('get-cierre', (_, { usuario_id }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id, saldo_inicial, hora FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(usuario_id, hoy);

    if (!apertura) {
      return { ventas: [], total: 0, totalDescuentos: 0, cantidad: 0, porPago: {}, usuario: '', movimientos: [], totalIngresos: 0, totalEgresos: 0, porPagoPagos: {}, porPagoCobros: {}, yaCerrado: false, saldoInicial: 0, aperturaId: null };
    }

    const desdeApertura = apertura.hora;
    const saldoInicial = apertura.saldo_inicial;
    const aperturaId = apertura.id;

    const ventas = db.prepare(`
      SELECT v.id, v.fecha_hora, v.total, v.notas, v.descuento, v.total_con_descuento,
             COUNT(dv.id) as items_count
      FROM ventas v
      LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
      WHERE v.usuario_id = ? AND v.fecha_hora >= ?
      GROUP BY v.id
      ORDER BY v.id
    `).all(usuario_id, desdeApertura);

    const totalVentas = ventas.reduce((s, v) => {
      const totalFinal = (v.total_con_descuento && v.total_con_descuento > 0) ? v.total_con_descuento : Math.max(0, v.total - (v.descuento || 0));
      return s + totalFinal;
    }, 0);

    const totalDescuentos = ventas.reduce((s, v) => s + (v.descuento || 0), 0);

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

    return { ventas, total: totalVentas, totalDescuentos, cantidad: ventas.length, porPago, usuario: usuario?.username || '', movimientos, totalIngresos, totalEgresos, porPagoPagos, porPagoCobros, yaCerrado, saldoInicial, aperturaId };
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

    if (!apertura) {
      return { cantidad: 0, total: 0, saldo_pendiente: 0, pendiente: 0 };
    }

    const desdeApertura = apertura.hora;
    const yaCerrado = !!db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id);

    const res = db.prepare(`
      SELECT COUNT(*) as cantidad, COALESCE(SUM(total), 0) as total,
             COALESCE(SUM(saldo_pendiente), 0) as saldo_pendiente
      FROM ventas
      WHERE usuario_id = ? AND fecha_hora >= ?
    `).get(usuario_id, desdeApertura);
    return { ...res, pendiente: yaCerrado ? 0 : res.total };
  });

  ipcMain.handle('cobrar-pendiente', (_, { venta_id, monto, metodo, usuario_id, usuario_nombre }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id FROM apertura_caja WHERE usuario_id = ? AND fecha = ?').get(usuario_id, hoy);
    if (!apertura) return { error: 'No tenés caja abierta. Abrila antes de cobrar.' };

    const venta = db.prepare('SELECT saldo_pendiente FROM ventas WHERE id = ?').get(venta_id);
    if (!venta) return { error: 'Venta no encontrada' };

    const nuevoSaldo = Math.max(0, venta.saldo_pendiente - monto);
    const estado = nuevoSaldo <= 0 ? 'completada' : 'pendiente';
    const fechaCobro = estado === 'completada' ? ", fecha_cobro = datetime('now','localtime')" : '';

    db.prepare(`UPDATE ventas SET estado = ?, saldo_pendiente = ?${fechaCobro} WHERE id = ?`).run(estado, nuevoSaldo, venta_id);
    db.prepare('INSERT INTO cobros (venta_id, monto, metodo, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?)').run(venta_id, monto, metodo || 'Efectivo', usuario_id || null, usuario_nombre || null);

    if (monto > 0) {
      db.prepare('INSERT INTO movimientos_caja (tipo, monto, concepto, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?)').run(
        'ingreso', monto, `Cobro venta #${venta_id} - regularización`, usuario_id || null, usuario_nombre || null
      );
    }

    return { success: true, estado, nuevoSaldo };
  });

  ipcMain.handle('get-pendientes', (_, { usuario_id, rol }) => {
    let query = `
      SELECT v.id, v.fecha_hora, v.total, v.saldo_pendiente, v.notas,
             u.username
      FROM ventas v
      JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.estado = 'pendiente'
    `;
    if (rol !== 'admin') {
      query += ` AND v.usuario_id = ? `;
    }
    query += ` ORDER BY v.fecha_hora DESC`;
    if (rol !== 'admin') {
      return db.prepare(query).all(usuario_id);
    }
    return db.prepare(query).all();
  });

  ipcMain.handle('get-sale-detail', (_, { saleId, usuario_id, rol }) => {
    if (rol !== 'admin') {
      const venta = db.prepare('SELECT usuario_id FROM ventas WHERE id = ?').get(saleId);
      if (!venta || venta.usuario_id !== usuario_id) return [];
    }
    return db.prepare(`
      SELECT dv.cantidad, dv.precio_unitario, dv.subtotal,
             p.nombre, p.variante
      FROM detalle_ventas dv
      JOIN productos p ON p.id = dv.producto_id
      WHERE dv.venta_id = ?
      ORDER BY dv.id
    `).all(saleId);
  });

  ipcMain.handle('add-item-to-sale', (_, { venta_id, producto_id, cantidad, precio_unitario, subtotal, usuario_id }) => {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta_id);
    if (!venta) return { success: false, error: 'Venta no encontrada' };

    // Validar que la caja del usuario esté abierta
    const hoy = new Date().toISOString().slice(0, 10);
    const ventaUsuarioId = venta.usuario_id || usuario_id;
    const apertura = db.prepare('SELECT id FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(ventaUsuarioId, hoy);
    if (!apertura) return { success: false, error: 'No hay caja abierta. Abrí la caja primero.' };
    const tieneCierre = db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id);
    if (tieneCierre) return { success: false, error: 'La caja ya está cerrada. No se pueden agregar productos.' };

    // Validar stock
    const producto = db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(producto_id);
    if (!producto) return { success: false, error: 'Producto no encontrado' };
    if (producto.stock_actual < cantidad) return { success: false, error: 'Stock insuficiente' };

    const agregarItem = db.transaction(() => {
      // Insertar detalle
      db.prepare(
        'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
      ).run(venta_id, producto_id, cantidad, precio_unitario, subtotal);

      // Descontar stock
      db.prepare('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?').run(cantidad, producto_id);

      // Actualizar total de la venta
      const nuevoTotal = venta.total + subtotal;
      const nuevoTotalConDescuento = (venta.total_con_descuento || venta.total) + subtotal;

      if (venta.estado === 'pendiente' && venta.saldo_pendiente > 0) {
        // Si la venta tiene saldo pendiente, aumentar el saldo también
        const nuevoSaldo = venta.saldo_pendiente + subtotal;
        db.prepare('UPDATE ventas SET total = ?, total_con_descuento = ?, saldo_pendiente = ? WHERE id = ?')
          .run(nuevoTotal, nuevoTotalConDescuento, nuevoSaldo, venta_id);
      } else {
        db.prepare('UPDATE ventas SET total = ?, total_con_descuento = ? WHERE id = ?')
          .run(nuevoTotal, nuevoTotalConDescuento, venta_id);
      }

      return { success: true };
    });

    return agregarItem();
  });

  ipcMain.handle('get-sale-full-detail', (_, { venta_id, usuario_id, rol }) => {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta_id);
    if (!venta) return null;
    if (rol !== 'admin' && venta.usuario_id !== usuario_id) return null;
    const items = db.prepare(`
      SELECT dv.id, dv.producto_id, dv.cantidad, dv.precio_unitario, dv.subtotal,
             p.nombre, p.variante, p.codigo, p.stock_actual
      FROM detalle_ventas dv
      JOIN productos p ON p.id = dv.producto_id
      WHERE dv.venta_id = ?
      ORDER BY dv.id
    `).all(venta_id);
    const pagos = db.prepare('SELECT * FROM pagos WHERE venta_id = ? ORDER BY id').all(venta_id);
    return { ...venta, items, pagos };
  });

  ipcMain.handle('update-sale-item-quantity', (_, { detalle_id, nueva_cantidad, usuario_id }) => {
    const detalle = db.prepare('SELECT * FROM detalle_ventas WHERE id = ?').get(detalle_id);
    if (!detalle) return { success: false, error: 'Item no encontrado' };

    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(detalle.venta_id);
    if (!venta) return { success: false, error: 'Venta no encontrada' };

    // Validar caja abierta
    const hoy = new Date().toISOString().slice(0, 10);
    const ventaUsuarioId = venta.usuario_id || usuario_id;
    const apertura = db.prepare('SELECT id FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(ventaUsuarioId, hoy);
    if (!apertura) return { success: false, error: 'No hay caja abierta' };
    const tieneCierre = db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id);
    if (tieneCierre) return { success: false, error: 'La caja ya está cerrada' };

    const diferencia = nueva_cantidad - detalle.cantidad;
    const producto = db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(detalle.producto_id);
    if (!producto) return { success: false, error: 'Producto no encontrado' };

    // Si se aumenta cantidad, validar stock
    if (diferencia > 0 && producto.stock_actual < diferencia) {
      return { success: false, error: 'Stock insuficiente' };
    }

    const nuevoSubtotal = nueva_cantidad * detalle.precio_unitario;
    const diferenciaSubtotal = nuevoSubtotal - detalle.subtotal;

    const actualizar = db.transaction(() => {
      // Actualizar detalle
      db.prepare('UPDATE detalle_ventas SET cantidad = ?, subtotal = ? WHERE id = ?')
        .run(nueva_cantidad, nuevoSubtotal, detalle_id);

      // Ajustar stock
      db.prepare('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?')
        .run(diferencia, detalle.producto_id);

      // Actualizar totales de venta
      const nuevoTotal = venta.total + diferenciaSubtotal;
      const nuevoTotalConDescuento = (venta.total_con_descuento || venta.total) + diferenciaSubtotal;

      if (venta.estado === 'pendiente' && venta.saldo_pendiente > 0) {
        const nuevoSaldo = venta.saldo_pendiente + diferenciaSubtotal;
        db.prepare('UPDATE ventas SET total = ?, total_con_descuento = ?, saldo_pendiente = ? WHERE id = ?')
          .run(nuevoTotal, nuevoTotalConDescuento, Math.max(0, nuevoSaldo), venta.id);
      } else {
        db.prepare('UPDATE ventas SET total = ?, total_con_descuento = ? WHERE id = ?')
          .run(nuevoTotal, nuevoTotalConDescuento, venta.id);
      }

      return { success: true };
    });

    return actualizar();
  });

  ipcMain.handle('remove-sale-item', (_, { detalle_id, usuario_id }) => {
    const detalle = db.prepare('SELECT * FROM detalle_ventas WHERE id = ?').get(detalle_id);
    if (!detalle) return { success: false, error: 'Item no encontrado' };

    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(detalle.venta_id);
    if (!venta) return { success: false, error: 'Venta no encontrada' };

    // Validar caja abierta
    const hoy = new Date().toISOString().slice(0, 10);
    const ventaUsuarioId = venta.usuario_id || usuario_id;
    const apertura = db.prepare('SELECT id FROM apertura_caja WHERE usuario_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1').get(ventaUsuarioId, hoy);
    if (!apertura) return { success: false, error: 'No hay caja abierta' };
    const tieneCierre = db.prepare('SELECT id FROM cierres WHERE apertura_id = ?').get(apertura.id);
    if (tieneCierre) return { success: false, error: 'La caja ya está cerrada' };

    const eliminar = db.transaction(() => {
      // Eliminar detalle
      db.prepare('DELETE FROM detalle_ventas WHERE id = ?').run(detalle_id);

      // Restaurar stock
      db.prepare('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?')
        .run(detalle.cantidad, detalle.producto_id);

      // Actualizar totales de venta
      const nuevoTotal = Math.max(0, venta.total - detalle.subtotal);
      const nuevoTotalConDescuento = Math.max(0, (venta.total_con_descuento || venta.total) - detalle.subtotal);

      if (venta.estado === 'pendiente' && venta.saldo_pendiente > 0) {
        const nuevoSaldo = Math.max(0, venta.saldo_pendiente - detalle.subtotal);
        const nuevoEstado = nuevoSaldo <= 0 ? 'completada' : 'pendiente';
        db.prepare('UPDATE ventas SET total = ?, total_con_descuento = ?, saldo_pendiente = ?, estado = ? WHERE id = ?')
          .run(nuevoTotal, nuevoTotalConDescuento, nuevoSaldo, nuevoEstado, venta.id);
      } else {
        db.prepare('UPDATE ventas SET total = ?, total_con_descuento = ? WHERE id = ?')
          .run(nuevoTotal, nuevoTotalConDescuento, venta.id);
      }

      return { success: true };
    });

    return eliminar();
  });

  ipcMain.handle('get-cobros', (_, venta_id) => {
    return db.prepare('SELECT id, monto, metodo, fecha, usuario_nombre FROM cobros WHERE venta_id = ? ORDER BY fecha ASC').all(venta_id);
  });

  ipcMain.handle('update-sale-payments', (_, { venta_id, pagos, usuario_id }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const apertura = db.prepare('SELECT id FROM apertura_caja WHERE usuario_id = ? AND fecha = ?').get(usuario_id, hoy);
    if (!apertura) return { error: 'No tenés caja abierta. Abrila para editar pagos.' };

    const venta = db.prepare('SELECT total_con_descuento, estado FROM ventas WHERE id = ?').get(venta_id);
    if (!venta) return { error: 'Venta no encontrada' };

    const totalPagado = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    const nuevoSaldo = Math.max(0, (venta.total_con_descuento || 0) - totalPagado);
    const nuevoEstado = nuevoSaldo <= 0 ? 'completada' : 'pendiente';
    const metodoPago = pagos.filter(p => p.monto > 0).map(p => `${p.metodo}: $${p.monto}`).join('; ') || 'Sin pago';

    const actualizar = db.transaction(() => {
      db.prepare('DELETE FROM pagos WHERE venta_id = ?').run(venta_id);
      const insert = db.prepare('INSERT INTO pagos (venta_id, metodo, monto) VALUES (?, ?, ?)');
      for (const p of pagos) {
        if (p.monto > 0) insert.run(venta_id, p.metodo, p.monto);
      }
      db.prepare('UPDATE ventas SET metodo_pago = ?, saldo_pendiente = ?, estado = ? WHERE id = ?')
        .run(metodoPago, nuevoSaldo, nuevoEstado, venta_id);
    });
    actualizar();

    return { success: true, saldo_pendiente: nuevoSaldo, estado: nuevoEstado, metodo_pago: metodoPago };
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

  ipcMain.handle('get-movimientos-por-apertura', (_, { apertura_id }) => {
    if (!apertura_id) return [];
    const apertura = db.prepare('SELECT usuario_id, hora FROM apertura_caja WHERE id = ?').get(apertura_id);
    if (!apertura) return [];
    return db.prepare(`
      SELECT id, tipo, monto, concepto, fecha, usuario_nombre
      FROM movimientos_caja
      WHERE usuario_id = ? AND fecha >= ?
      ORDER BY id DESC
    `).all(apertura.usuario_id, apertura.hora);
  });

  ipcMain.handle('get-historial-movimientos', (_, { desde, hasta, usuario_id, tipo }) => {
    let conditions = [];
    let params = [];

    if (desde && hasta) {
      conditions.push(`m.fecha >= ? AND m.fecha <= ? || ' 23:59:59'`);
      params.push(desde, hasta);
    }

    if (usuario_id) {
      conditions.push(`m.usuario_id = ?`);
      params.push(usuario_id);
    }

    if (tipo && tipo !== 'todos') {
      conditions.push(`m.tipo = ?`);
      params.push(tipo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const movimientos = db.prepare(`
      SELECT m.id, m.tipo, m.monto, m.concepto, m.fecha, m.usuario_id, m.usuario_nombre
      FROM movimientos_caja m
      ${whereClause}
      ORDER BY m.fecha DESC
    `).all(...params);

    const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
    const totalEgresos = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);

    return { movimientos, totalIngresos, totalEgresos };
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

  ipcMain.handle('descartar-producto', (_, { producto_id, cantidad, motivo, usuario_id, usuario_nombre }) => {
    const producto = db.prepare('SELECT id, stock_actual, nombre FROM productos WHERE id = ?').get(producto_id);
    if (!producto) return { success: false, error: 'Producto no encontrado' };
    if (cantidad <= 0) return { success: false, error: 'La cantidad debe ser mayor a 0' };
    if (cantidad > producto.stock_actual) return { success: false, error: `Stock insuficiente (disponible: ${producto.stock_actual})` };

    const descartar = db.transaction(() => {
      db.prepare('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?').run(cantidad, producto_id);
      const result = db.prepare(
        'INSERT INTO descartes (producto_id, cantidad, motivo, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?)'
      ).run(producto_id, cantidad, motivo || null, usuario_id || null, usuario_nombre || null);
      return { success: true, id: result.lastInsertRowid };
    });

    return descartar();
  });

  ipcMain.handle('get-descartes', () => {
    return db.prepare(`
      SELECT d.id, d.cantidad, d.motivo, d.fecha, d.usuario_nombre, p.nombre, p.codigo
      FROM descartes d
      JOIN productos p ON p.id = d.producto_id
      ORDER BY d.id DESC
    `).all();
  });

  ipcMain.handle('get-ventas-reporte', (_, { desde, hasta }) => {
    const filtroFecha = desde && hasta
      ? `AND v.fecha_hora >= ? AND v.fecha_hora <= ? || ' 23:59:59'`
      : '';
    const params = desde && hasta ? [desde, hasta] : [];

    const ventas = db.prepare(`
      SELECT v.id, v.fecha_hora, v.total, v.total_con_descuento, v.descuento,
             v.metodo_pago, v.estado, v.saldo_pendiente, v.usuario_nombre,
             COUNT(dv.id) as items_count
      FROM ventas v
      LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
      WHERE 1=1 ${filtroFecha}
      GROUP BY v.id
      ORDER BY v.fecha_hora ASC
    `).all(...params);

    const totalVentas = ventas.reduce((s, v) => s + (v.total_con_descuento || v.total || 0), 0);
    const totalDescuentos = ventas.reduce((s, v) => s + (v.descuento || 0), 0);
    const cantidadVentas = ventas.length;
    const promedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;
    const ventasPendientes = ventas.filter(v => v.estado === 'pendiente');
    const totalPendiente = ventasPendientes.reduce((s, v) => s + (v.saldo_pendiente || 0), 0);

    const porPago = {};
    for (const v of ventas) {
      const partes = (v.metodo_pago || '').split('; ');
      for (const parte of partes) {
        const match = parte.match(/^(.+?):\s*\$([\d.,]+)/);
        if (match) {
          const metodo = match[1].trim();
          const monto = parseFloat(match[2].replace(/\./g, '').replace(',', '.')) || 0;
          porPago[metodo] = (porPago[metodo] || 0) + monto;
        }
      }
    }

    const productosVendidos = db.prepare(`
      SELECT p.nombre, p.codigo, SUM(dv.cantidad) as total_cantidad,
             SUM(dv.subtotal) as total_monto
      FROM detalle_ventas dv
      JOIN productos p ON p.id = dv.producto_id
      JOIN ventas v ON v.id = dv.venta_id
      WHERE 1=1 ${filtroFecha.replace('v.', 'v.')}
      GROUP BY p.id
      ORDER BY total_cantidad DESC
    `).all(...params);

    const stockActual = db.prepare(`
      SELECT nombre, codigo, stock_actual, categoria
      FROM productos
      ORDER BY stock_actual ASC, nombre
    `).all();

    const stockBajo = stockActual.filter(p => p.stock_actual <= 10);

    const ventasPorDia = {};
    for (const v of ventas) {
      const dia = v.fecha_hora ? v.fecha_hora.slice(0, 10) : 'sin fecha';
      if (!ventasPorDia[dia]) ventasPorDia[dia] = { cantidad: 0, total: 0 };
      ventasPorDia[dia].cantidad += 1;
      ventasPorDia[dia].total += (v.total_con_descuento || v.total || 0);
    }

    return {
      ventas,
      resumen: {
        totalVentas,
        totalDescuentos,
        cantidadVentas,
        promedio,
        totalPendiente,
        ventasPendientes: ventasPendientes.length,
      },
      porPago,
      productosVendidos,
      stockActual,
      stockBajo,
      ventasPorDia,
    };
  });

  // === HANDLERS DE CONTABILIDAD ===

  ipcMain.handle('get-categorias-gasto', () => {
    return db.prepare('SELECT * FROM categorias_gasto ORDER BY nombre').all();
  });

  ipcMain.handle('create-categoria-gasto', (_, { nombre, icono }) => {
    try {
      const result = db.prepare('INSERT INTO categorias_gasto (nombre, icono) VALUES (?, ?)').run(nombre, icono || '📦');
      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      if (err.message.includes('UNIQUE')) return { success: false, error: 'Ya existe una categoría con ese nombre' };
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-categoria-gasto', (_, id) => {
    const enUso = db.prepare('SELECT COUNT(*) as c FROM gastos WHERE categoria_id = ?').get(id);
    if (enUso.c > 0) return { success: false, error: 'No se puede eliminar: tiene gastos asociados' };
    db.prepare('DELETE FROM categorias_gasto WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('create-gasto', (_, { monto, fecha, categoria_id, concepto, proveedor, recurrente, notas }) => {
    const result = db.prepare(
      'INSERT INTO gastos (monto, fecha, categoria_id, concepto, proveedor, recurrente, notas) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(monto, fecha, categoria_id, concepto, proveedor || '', recurrente ? 1 : 0, notas || '');
    return { success: true, id: result.lastInsertRowid };
  });

  ipcMain.handle('get-gastos', (_, { mes, categoria_id }) => {
    let conditions = [];
    let params = [];
    if (mes) {
      conditions.push(`strftime('%Y-%m', g.fecha) = ?`);
      params.push(mes);
    }
    if (categoria_id) {
      conditions.push(`g.categoria_id = ?`);
      params.push(categoria_id);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return db.prepare(`
      SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono
      FROM gastos g
      JOIN categorias_gasto c ON c.id = g.categoria_id
      ${where}
      ORDER BY g.fecha DESC, g.id DESC
    `).all(...params);
  });

  ipcMain.handle('update-gasto', (_, { id, monto, fecha, categoria_id, concepto, proveedor, recurrente, notas }) => {
    db.prepare(
      'UPDATE gastos SET monto = ?, fecha = ?, categoria_id = ?, concepto = ?, proveedor = ?, recurrente = ?, notas = ? WHERE id = ?'
    ).run(monto, fecha, categoria_id, concepto, proveedor || '', recurrente ? 1 : 0, notas || '', id);
    return { success: true };
  });

  ipcMain.handle('delete-gasto', (_, id) => {
    db.prepare('DELETE FROM gastos WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('get-resumen-contabilidad', () => {
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

    // Ventas del mes
    const ventasMes = db.prepare(`
      SELECT COALESCE(SUM(total_con_descuento), 0) as total
      FROM ventas
      WHERE strftime('%Y-%m', fecha_hora) = ?
    `).get(mesActual);

    // Gastos del mes
    const gastosMes = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM gastos
      WHERE strftime('%Y-%m', fecha) = ?
    `).get(mesActual);

    // Gastos por categoría este mes
    const gastosPorCategoria = db.prepare(`
      SELECT c.nombre, c.icono, COALESCE(SUM(g.monto), 0) as total, COUNT(g.id) as cantidad
      FROM categorias_gasto c
      LEFT JOIN gastos g ON g.categoria_id = c.id AND strftime('%Y-%m', g.fecha) = ?
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `).all(mesActual);

    // Últimos 5 gastos
    const ultimosGastos = db.prepare(`
      SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono
      FROM gastos g
      JOIN categorias_gasto c ON c.id = g.categoria_id
      ORDER BY g.fecha DESC, g.id DESC
      LIMIT 5
    `).all();

    // Totales generales (todos los tiempos)
    const totalGeneralVentas = db.prepare('SELECT COALESCE(SUM(total_con_descuento), 0) as total FROM ventas').get();
    const totalGeneralGastos = db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM gastos').get();

    // Meses con datos (para el gráfico, últimos 6 meses)
    const mesesGrafico = [];
    for (let i = 5; i >= 0; i--) {
      const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const m = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      const label = f.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
      const v = db.prepare('SELECT COALESCE(SUM(total_con_descuento), 0) as total FROM ventas WHERE strftime(\'%Y-%m\', fecha_hora) = ?').get(m);
      const g = db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM gastos WHERE strftime(\'%Y-%m\', fecha) = ?').get(m);
      mesesGrafico.push({ label, ventas: v.total, gastos: g.total });
    }

    const ingresos = ventasMes.total;
    const egresos = gastosMes.total;
    const balance = ingresos - egresos;
    const margen = ingresos > 0 ? ((ingresos - egresos) / ingresos * 100) : 0;

    return {
      ingresos, egresos, balance, margen,
      gastosPorCategoria, ultimosGastos,
      totalGeneralVentas: totalGeneralVentas.total,
      totalGeneralGastos: totalGeneralGastos.total,
      mesesGrafico
    };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});
