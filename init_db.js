import Database from 'better-sqlite3';
// Abre o crea el archivo físico de la base de datos en la raíz
const db = new Database('panaderia.db', { verbose: console.log });

// 1. CREACIÓN DE TABLAS
// Usamos una transacción para asegurarnos de que se creen todas juntas o ninguna
const inicializarTablas = db.transaction(() => {
    // Tabla de Productos
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

    // Tabla de Ventas (Cabecera)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
            total REAL NOT NULL,
            metodo_pago TEXT NOT NULL, -- Efectivo, Mercado Pago, Débito
            notas TEXT
        )
    `).run();

    // Tabla de Detalle de Ventas (Renglones de la venta)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS detalle_ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venta_id INTEGER NOT NULL,
            producto_id INTEGER NOT NULL,
            cantidad REAL NOT NULL, -- REAL por si venden pan por kilo (ej: 0.5 kg)
            precio_unitario REAL NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
            FOREIGN KEY (producto_id) REFERENCES productos(id)
        )
    `).run();

    // Tabla de Usuarios
    db.prepare(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            rol TEXT NOT NULL DEFAULT 'vendedor' -- admin | vendedor
        )
    `).run();
});

// Ejecutar la creación de tablas
inicializarTablas();
console.log("¡Tablas creadas con éxito!");

// 2. POBLAR EL MENÚ INICIAL
// Lista de tus productos extraídos directamente del Excel
const catalogoInicial = [
    { cat: 'Panadería & Pastelería', nom: 'Chipa', var: 'Estándar', uni: 'Unidad', precio: 2000 },
    { cat: 'Panadería & Pastelería', nom: 'Golfeado', var: 'Mini', uni: 'Unidad', precio: 2100 },
    { cat: 'Panadería & Pastelería', nom: 'Golfeado', var: 'Grande', uni: 'Unidad', precio: 5500 },
    { cat: 'Panadería & Pastelería', nom: 'Palmerita', var: 'Estándar', uni: 'Unidad', precio: 1000 },
    { cat: 'Panadería & Pastelería', nom: 'Rolls', var: 'Mini', uni: 'Unidad', precio: 2000 },
    { cat: 'Panadería & Pastelería', nom: 'Medialunas', var: 'Estándar', uni: 'Unidad', precio: 1000 },
    { cat: 'Panadería & Pastelería', nom: 'Mini Lunch', var: 'Estándar', uni: 'Unidad', precio: 7000 },
    { cat: 'Panadería & Pastelería', nom: 'Piñita', var: 'Estándar', uni: 'Unidad', precio: 600 },
    { cat: 'Panadería & Pastelería', nom: 'Croissant', var: 'Estándar', uni: 'Unidad', precio: 2000 },
    { cat: 'Panadería & Pastelería', nom: 'Tequeño', var: 'Estándar', uni: 'Unidad', precio: 2800 },
    { cat: 'Panadería & Pastelería', nom: 'Pastelito J y Q', var: 'Estándar', uni: 'Unidad', precio: 4200 },
    { cat: 'Panadería & Pastelería', nom: 'Pastelito Ricotta', var: 'Estándar', uni: 'Unidad', precio: 4200 },
    { cat: 'Panadería & Pastelería', nom: 'Cachito J y Q', var: 'Estándar', uni: 'Unidad', precio: 4700 },
    { cat: 'Panadería & Pastelería', nom: 'Cachito Queso Cream', var: 'Estándar', uni: 'Unidad', precio: 4800 },
    { cat: 'Panadería & Pastelería', nom: 'Pan de Coco', var: 'Estándar', uni: 'Unidad', precio: 800 },
    { cat: 'Panadería & Pastelería', nom: 'Pan de Queso', var: 'Mini', uni: 'Unidad', precio: 4300 },
    { cat: 'Panadería & Pastelería', nom: 'Pan de Queso', var: 'Grande', uni: 'Unidad', precio: 7500 },
    { cat: 'Panadería & Pastelería', nom: 'Pan Panceta y Queso', var: 'Estándar', uni: 'Unidad', precio: 4300 },
    { cat: 'Panadería & Pastelería', nom: 'Pan Andino', var: 'Estándar', uni: 'Unidad', precio: 2000 },
    { cat: 'Panadería & Pastelería', nom: 'Pan Queso y Panceta', var: 'Estándar', uni: 'Unidad', precio: 4300 },
    { cat: 'Panadería & Pastelería', nom: 'Pan de Orégano', var: 'Estándar', uni: 'Unidad', precio: 2000 },
    { cat: 'Panadería & Pastelería', nom: 'Pan Francés', var: 'Estándar', uni: 'Unidad', precio: 650 },
    { cat: 'Panadería & Pastelería', nom: 'Pan Canilla', var: 'Estándar', uni: 'Unidad', precio: 1500 },
    { cat: 'Panadería & Pastelería', nom: 'Pan de Jamón', var: 'Mini', uni: 'Unidad', precio: 8500 },
    { cat: 'Panadería & Pastelería', nom: 'Pan de Manzana', var: 'Estándar', uni: 'Unidad', precio: 4200 },
    { cat: 'Panadería & Pastelería', nom: 'Pan Guayaba', var: 'Estándar', uni: 'Unidad', precio: 3200 },
    { cat: 'Panadería & Pastelería', nom: 'Pan Guayaba y Queso', var: 'Estándar', uni: 'Unidad', precio: 3500 },
    { cat: 'Panadería & Pastelería', nom: 'Torta 3 Leches', var: 'Estándar', uni: 'Unidad', precio: 7000 },
    { cat: 'Bebidas', nom: 'Gaseosas Vzlanas', var: 'Estándar', uni: 'Unidad', precio: 2500 },
    { cat: 'Bebidas', nom: 'Malta', var: 'Estándar', uni: 'Unidad', precio: 2500 },
    { cat: 'Bebidas', nom: 'Gaseosas 500mL', var: 'Estándar', uni: 'Unidad', precio: 3200 },
    { cat: 'Bebidas', nom: 'Agua', var: 'Estándar', uni: 'Unidad', precio: 2000 },
    { cat: 'Bebidas', nom: 'Jugo Baggio', var: 'Estándar', uni: 'Unidad', precio: 1000 }
];

// Verificamos si la tabla ya tiene datos para no duplicarlos cada vez que ejecutemos
const totalProductos = db.prepare('SELECT COUNT(*) as count FROM productos').get();

if (totalProductos.count === 0) {
    const insertStatement = db.prepare(`
        INSERT INTO productos (categoria, nombre, variante, unidad, precio_venta, stock_actual)
        VALUES (?, ?, ?, ?, ?, 100) -- Les asignamos un stock inicial ficticio de 100 para testear ventas
    `);

    // Inserción masiva optimizada dentro de una transacción
    const poblarBD = db.transaction((productos) => {
        for (const prod of productos) {
            insertStatement.run(prod.cat, prod.nom, prod.var, prod.uni, prod.precio);
        }
    });

    poblarBD(catalogoInicial);
    console.log(`¡Éxito! Se cargaron ${catalogoInicial.length} productos iniciales.`);
} else {
    console.log("La base de datos ya contiene productos cargados. Saltando inicialización del catálogo.");
}

// 3. POBLAR USUARIOS POR DEFECTO
const totalUsuarios = db.prepare('SELECT COUNT(*) as count FROM usuarios').get();

if (totalUsuarios.count === 0) {
    const insertUser = db.prepare('INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)');
    const poblarUsuarios = db.transaction(() => {
        insertUser.run('admin', 'admin', 'admin');
        insertUser.run('vendedor', 'vendedor', 'vendedor');
    });
    poblarUsuarios();
    console.log('Usuarios creados: admin/admin y vendedor/vendedor');
} else {
    console.log('Los usuarios ya existen. Saltando.');
}

// 4. MIGRACIONES (para tablas que ya existen)
const columnasVentas = db.prepare("PRAGMA table_info(ventas)").all();
if (!columnasVentas.find(c => c.name === 'usuario_id')) {
    db.prepare("ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)").run();
    console.log('Migración: columna usuario_id agregada a ventas.');
}
if (!columnasVentas.find(c => c.name === 'cerrado')) {
    db.prepare("ALTER TABLE ventas ADD COLUMN cerrado INTEGER DEFAULT 0").run();
    console.log('Migración: columna cerrado agregada a ventas.');
}
if (!columnasVentas.find(c => c.name === 'estado')) {
    db.prepare("ALTER TABLE ventas ADD COLUMN estado TEXT DEFAULT 'completada'").run();
    console.log('Migración: columna estado agregada a ventas.');
}
if (!columnasVentas.find(c => c.name === 'saldo_pendiente')) {
    db.prepare("ALTER TABLE ventas ADD COLUMN saldo_pendiente REAL DEFAULT 0").run();
    console.log('Migración: columna saldo_pendiente agregada a ventas.');
}
if (!columnasVentas.find(c => c.name === 'fecha_cobro')) {
    db.prepare("ALTER TABLE ventas ADD COLUMN fecha_cobro TEXT").run();
    console.log('Migración: columna fecha_cobro agregada a ventas.');
}

// Crear tablas si no existen
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

// Cerramos la conexión
db.close();