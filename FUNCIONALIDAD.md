# Casa Caribe POS — Documentación Funcional

> Este archivo describe el estado funcional de la aplicación. Actualizar con cada cambio.

## Datos generales

| Campo | Valor |
|-------|-------|
| Nombre | Casa Caribe POS |
| Tipo | Punto de venta de escritorio |
| Stack | Electron 42 + better-sqlite3 + HTML/CSS/JS vanilla |
| Base de datos | SQLite (`panaderia.db`) |
| Moneda | ARS ($) |

---

## Módulos

### 1. Login

- Pantalla de acceso con usuario y contraseña
- Dos roles:
  - **admin** — acceso completo
  - **vendedor** — solo ventas y pendientes
- Usuarios por defecto: `admin/admin` y `vendedor/vendedor`

### 1.5 Descartar Productos

- Botón **🗑️ Descartar** en el header, visible para todos los perfiles
- No requiere caja abierta
- **Modal con pestañas**: Descartar / Historial
- **Vista Descartar**: lista de productos a la izquierda, carrito de descartes a la derecha
- Buscador de productos por nombre, código o categoría
- Clic en un producto lo agrega al carrito con cantidad 1
- En el carrito: **+** / **−** para ajustar cantidad, **×** para quitar item
- Stock disponible se actualiza en tiempo real (descuenta lo ya agregado al carrito)
- Botón **"🗑️ Descartar todo"** confirma todos los descartes de una
- Confirmación antes de procesar
- Solo afecta el stock, no genera venta ni movimiento de caja
- Registro en tabla `descartes` con fecha, usuario y motivo
- **Vista Historial**: resumen (total descartes, unidades), lista completa de descartes con código, nombre, usuario, fecha y cantidad

### 2. Panel principal (POS)

- Header con: título, total del carrito, botones de navegación, info del usuario
- Barra de resumen del día (cantidad ventas, total, pendientes)
- **Categorías** como filtros: Todas, Panadería, Pastelería, Facturas, Salado, Bebidas, Otros
- **Buscador** de productos por nombre, variante o código
- **Grid de productos** con cards: código, nombre, precio, badge de stock (verde/amarillo/rojo/gris)
- **Carrito lateral** con: items, +/- cantidad, subtotal por item, total, botón "Finalizar venta"
- Botón **"+ Agregar producto"** (solo admin) para crear rápido desde el panel

### 3. Pago / Cierre de venta

- Modal con inputs para:
  - **Efectivo** — monto recibido
  - **Mercado Pago** — monto MP
  - **Transferencia** — monto transferencia
  - **Descuento** — monto a descontar
- Resumen en tiempo real: pago exacto / cambio / fiado
- **"Dejar pendiente"** — venta fiada sin pago
- **"Confirmar pago"** — registra la venta
- Campo de notas opcional
- Descuento de stock automático al confirmar

### 4. Historial de ventas

- **Admin**: modal ampliado con dashboard de análisis
  - Filtros por rango de fechas (desde/hasta)
  - Resumen: total ventas, cantidad, promedio, descuentos, pendientes
  - Desglose por método de pago (Efectivo, MP, Transferencia)
  - Top 10 productos más vendidos (unidades y monto)
  - Alerta de stock bajo (≤10 unidades)
  - Ventas por día (últimos 7 días)
  - Lista de ventas expandible con detalle
- **Vendedor**: lista simple de ventas (solo las propias)
  - Expandible para ver detalle: items, total, método de pago, fecha, vendedor, notas
  - Si tiene fiado: saldo pendiente y cobros parciales

### 5. Ventas pendientes (Fiado)

- Lista de ventas con `estado = 'pendiente'`
- Cada venta permite:
  - Seleccionar método de cobro
  - Ingresar monto (parcial o total)
  - Botón "Cobrar"
- Cada cobro se registra en tabla `cobros` con fecha, método y usuario

### 6. Edición de ventas

- Agregar productos a una venta existente
- Modificar cantidad de items
- Eliminar items de la venta
- Editar medios de pago
- Solo funciona si la caja está abierta y no cerrada

### 7. Apertura de caja

- Botón "🔓 Abrir Caja" visible para todos los perfiles
- Se oculta automáticamente cuando ya hay una caja abierta
- Input para saldo inicial en efectivo
- Solo se puede tener una caja abierta por día por usuario
- No permite ventas si no hay caja abierta

### 8. Cierre de jornada

- Resumen detallado del día:
  - Total ventas, cantidad, descuentos
  - Desglose por método de pago (ventas + cobros)
  - Movimientos de caja (ingresos/egresos)
  - Efectivo contado, retiro, dejado
- Permite cerrar aunque no haya actividades del día
- Al confirmar: marca ventas como cerradas y vuelve a mostrar botón "Abrir Caja"
- Historial de cierres accesible para admin

### 9. Gestión de productos (admin)

- Modal con tabla editable de todos los productos
- Columnas: código, nombre, variante, categoría, precio, stock
- Crear productos nuevos (con código auto-incremental)
- Eliminar productos
- Botón "Reiniciar Base de Datos" (restaura stock a 100)

### 10. Gestión de usuarios (admin)

- Crear usuarios con rol admin o vendedor
- Eliminar usuarios
- Cambiar contraseñas

### 11. Movimientos de caja

- Registrar ingresos y egresos manuales
- Concepto descriptivo
- Totalización: ingresos, egresos, saldo
- Eliminar movimientos individuales

### 12. Historial de movimientos de caja (admin)

- **Botón "💸 Movimientos"** en el header (solo admin)
- **Modal con filtros**:
  - Rango de fechas (desde/hasta)
  - Tipo de movimiento (Todos / Ingresos / Egresos)
- **Resumen** en tiempo real: total ingresos, total egresos, saldo neto
- **Lista detallada** de cada movimiento:
  - Icono de tipo (+/-)
  - Concepto
  - Usuario que lo creó
  - Fecha y hora
  - Monto con color según tipo
- **Acceso rápido** desde historial de cierres: botón "Ver detalle" en cada cierre para ver movimientos individuales de esa sesión

---

## Estructura de la base de datos

### Tablas

| Tabla | Descripción |
|-------|-------------|
| `productos` | Catálogo: código, categoría, nombre, variante, unidad, precio, costo, stock |
| `ventas` | Cabecera: fecha, total, método pago, notas, usuario, estado, saldo pendiente, descuento |
| `detalle_ventas` | Items de cada venta: producto, cantidad, precio, subtotal |
| `pagos` | Desglose de pagos por venta (Efectivo, MP, Transferencia) |
| `cobros` | Cobros parciales de ventas con fiado |
| `usuarios` | Usuarios del sistema (username, password, rol) |
| `cierres` | Resúmenes de cierre de jornada |
| `apertura_caja` | Aperturas de caja diarias |
| `movimientos_caja` | Ingresos/egresos manuales |
| `descartes` | Registro de productos descartados (sin impacto en ventas) |

### Relaciones

- `ventas.usuario_id` → `usuarios.id`
- `detalle_ventas.venta_id` → `ventas.id` (CASCADE)
- `detalle_ventas.producto_id` → `productos.id`
- `pagos.venta_id` → `ventas.id` (CASCADE)
- `cobros.venta_id` → `ventas.id` (CASCADE)
- `cierres.usuario_id` → `usuarios.id`
- `cierres.apertura_id` → `apertura_caja.id`
- `cobros.usuario_id` → `usuarios.id`
- `movimientos_caja.usuario_id` → `usuarios.id`
- `descartes.producto_id` → `productos.id`
- `descartes.usuario_id` → `usuarios.id`

---

## Archivos del proyecto

| Archivo | Función |
|---------|---------|
| `main.cjs` | Proceso principal: Electron, base de datos, handlers IPC |
| `preload.cjs` | Puente entre renderer y main (exposición de API) |
| `index.html` | Toda la interfaz (HTML + CSS + JS en un solo archivo) |
| `init_db.js` | Inicialización y migraciones de la DB |
| `panaderia.db` | Base de datos SQLite (local) |
| `logo.png` | Logo de la pantalla de login |
| `package.json` | Configuración, scripts y dependencias |

---

## Cambios realizados

<!-- Agregar entradas nuevas aquí -->

- **2026-07-04** — Documentación funcional inicial creada.
- **2026-07-04** — Feedback visual mejorado al eliminar productos en edición de ventas (atenúa item inmediatamente).
- **2026-07-04** — Nuevo módulo **Descartar Productos**: carrito de descarte con búsqueda, +/- cantidad, quitar items individuales. Tabla `descartes`. Disponible para todos los perfiles sin caja abierta.
- **2026-07-04** — **Reporte de ventas (admin)**: filtros por fecha, resumen con totales/promedio/descuentos, desglose por método de pago, top productos vendidos, alerta stock bajo, ventas por día.
- **2026-07-04** — **Fix cierre de caja**: cuando un usuario no tiene apertura de caja hoy, el cierre ahora muestra datos vacíos en lugar de traer ventas históricas (bug que mostraba saldo MP de días anteriores).
- **2026-07-13** — **Historial de movimientos de caja (admin)**: modal con filtros por fecha/tipo, resumen de totales, lista detallada. Botón "Ver detalle" en historial de cierres.
- **2026-07-13** — **Historial de descartes**: pestaña "Historial" en modal de descartes con resumen y lista completa.
- **2026-07-15** — **Abrir Caja para todos**: botón visible para todos los perfiles (antes era solo admin). Se oculta automáticamente cuando la caja ya está abierta.
- **2026-07-15** — **Cierre sin actividad**: ahora permite cerrar caja aunque no haya ventas ni movimientos del día.
- **2026-07-21** — **Fix cálculo efectivo en cierre**: el efectivo esperado ahora descuenta correctamente los retiros de caja (antes no los restaba, causando diferencias falsas).
- **2026-07-21** — **Fix crítico: cierres incluían ventas de otros días**: las queries de cierre y historial filtraban solo por `fecha >= apertura_hora` sin límite superior, incluyendo ventas de días posteriores. Ahora filtran por la fecha exacta del cierre.
- **2026-07-13** — **Historial de movimientos de caja (admin)**: nuevo modal con filtros por fecha y tipo, resumen de totales, lista detallada de movimientos. Botón "Ver detalle" en historial de cierres para ver movimientos individuales por sesión.
- **2026-07-13** — **Historial de descartes**: pestaña "Historial" dentro del modal de descartes con resumen (total, unidades) y lista completa de descartes registrados.
