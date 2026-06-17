# Casa Caribe — POS

Sistema de punto de venta para panadería, construido con **Electron** + **better-sqlite3**.

## Requisitos

- Node.js 18+
- pnpm

## Instalación

```bash
pnpm install
pnpm run init-db
pnpm run start
```

El comando `init-db` crea la base de datos `panaderia.db` con 33 productos de ejemplo y dos usuarios por defecto.

## Usuarios por defecto

| Usuario   | Contraseña | Rol       |
|-----------|------------|-----------|
| admin     | admin      | admin     |
| vendedor  | vendedor   | vendedor  |

## Funcionalidades

### Roles
- **admin**: acceso completo — ventas, stock, productos, usuarios, cierres, cobros
- **vendedor**: solo puede crear ventas y ver pendientes

### Ventas
- Selección de productos por categoría
- Carrito lateral con resumen en tiempo real
- Modal de pago con división de métodos:
  - **Efectivo**: monto entregado por el cliente (si sobra, se calcula cambio)
  - **Mercado Pago**
  - **Transferencia**
- Si el total pagado es menor al total de la venta, se genera automáticamente un **fiado** (saldo pendiente)
- Se descuenta stock automáticamente al confirmar la venta

### Productos (admin)
- Botón **🏷️ Productos** en el header
- Tabla editable: producto, tamaño, tipo, precio, cantidad
- Crear nuevos productos con **+ Nuevo**
- Eliminar productos con ✕
- Todos los cambios se guardan al cerrar la ventana

### Stock (admin)
- Dentro del modal Productos, columna **Cantidad** para ajustar stock

### Historial de ventas
- Modal con todas las ventas registradas
- Expandible para ver detalle: items, total, método de pago, fecha, vendedor, notas
- Si tiene fiado, muestra el saldo pendiente y la fecha de cobro
- Muestra los cobros parciales registrados con su método y vendedor

### Pendientes / Fiado
- Botón **📌 Pendientes** visible para todos los perfiles
- Lista de ventas con saldo pendiente
- Cada venta tiene:
  - Selector de **método de cobro** (Efectivo, M. Pago, Transf.)
  - Input numérico para **monto a cobrar** (puede ser parcial)
  - Botón **Cobrar**
- Cada cobro queda registrado en la tabla `cobros` con fecha, monto, método y usuario

### Cierre de jornada
- Botón **📊 Cierre**: muestra el resumen del día
- Al confirmar, todas las ventas del día se marcan como cerradas (`cerrado = 1`)
- El admin puede ver el historial de cierres en **📁 Cierres**

### Usuarios (admin)
- Botón **👥 Usuarios**: crear y eliminar usuarios con rol admin o vendedor

## Base de datos

Archivo local: `panaderia.db` (SQLite)

### Tablas principales

- `productos` — catálogo con nombre, variante, categoría, precio, stock
- `ventas` — cabecera de venta con total, método, notas, usuario, estado, saldo pendiente, fecha de cobro
- `detalle_ventas` — ítems de cada venta (producto, cantidad, precio, subtotal)
- `pagos` — desglose por método de pago de cada venta
- `cobros` — cobros parciales de ventas con fiado
- `usuarios` — usuarios del sistema
- `cierres` — resúmenes de cierre de jornada

### Migraciones

El archivo `init_db.js` detecta columnas faltantes y las agrega automáticamente al ejecutarse, permitiendo actualizar la base de datos sin perder datos existentes.

## Tecnologías

- **Electron 42** — interfaz de escritorio
- **better-sqlite3** — base de datos SQLite nativa
- **@electron/rebuild** — compatibilidad de módulos nativos con Electron
- **pnpm** — gestor de paquetes

## Scripts

| Comando           | Descripción                                |
|-------------------|--------------------------------------------|
| `pnpm run start`  | Inicia la aplicación Electron              |
| `pnpm run init-db`| Rebuild + migración + rebuild para Electron |
| `pnpm run dist`   | Empaqueta para la plataforma actual (macOS o Windows) |
| `pnpm run dist:mac` | Genera `.dmg` para macOS                 |
| `pnpm run dist:win` | Genera `.exe` instalador para Windows     |

## Distribución

El proyecto incluye `electron-builder` para generar instalables.

### macOS
```bash
pnpm run dist:mac
```
Genera un archivo `.dmg` en la carpeta `dist/`. Solo funciona en macOS.

### Windows
```bash
pnpm run dist:win
```
Genera un instalador `.exe` (NSIS) en `dist/`.  
Para buildear en macOS necesitás [Wine](https://www.winehq.org/). O directamente corré el comando en una PC con Windows.

> El instalador incluye la app + node_modules (con better-sqlite3 ya compilado para esa plataforma). Al abrir la app por primera vez se crea automáticamente `panaderia.db` en el directorio de la app. Si querés mantener la base de datos entre reinstalaciones, copiala antes.

## Notas

- Los precios se muestran en ARS ($) sin decimales
- La currency se configuró en `formatear()` con locale `es-AR`
- El logo en la pantalla de login es `logo.png`
- El archivo `panaderia.db` está en `.gitignore`
