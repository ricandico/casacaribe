# Historial de Chat — Casa Caribe POS
## Fecha: 2026-09-06

---

## Qué se hizo hoy

### 1. Instalación del entorno en máquina nueva
- **Node.js** v24.19.0 (LTS) instalado vía winget
- **pnpm** v12.3.4 instalado como gestor de paquetes
- **Git** v2.55.0.3 instalado vía winget
- **opencode** v1.18.29 instalado globalmente
- Política de ejecución PowerShell configurada a `RemoteSigned`
- PATH de usuario y sistema configurados permanentemente

### 2. Clonación del repositorio
```
git clone https://github.com/ricandico/casacaribe.git
```
- Repo clonado en `C:\Users\casac\casacaribe`
- App: **Casa Caribe POS** — Punto de venta para panadería (Electron + SQLite)

### 3. Configuración y primera ejecución
- `pnpm install` ejecutado exitosamente
- Bug en `init_db.js` corregido: faltaba columna `codigo` en tabla `productos`
- `pnpm run init-db` ejecutado — 33 productos, 2 usuarios iniciales
- `pnpm run dist:win` — compilación exitosa del instalador

### 4. Funcionalidad de Backup a GitHub (NUEVA)
Se agregó la funcionalidad **"A la nube"** para hacer backup automático de la base de datos a un repositorio privado de GitHub.

#### Archivos modificados:
- `main.cjs` — 5 handlers nuevos de backup
- `preload.cjs` — 4 funciones expuestas
- `index.html` — botón en sidebar, modal de configuración, lógica JS

#### Funcionalidades:
- **Botón "☁️ A la nube"** en sidebar (visible para todos los usuarios)
- **Configuración**: Owner, Repo, Token (se guarda local en `userData/backup-config.json`)
- **Probar conexión** antes de guardar
- **Backup manual** con un clic
- **Backup automático** al cerrar caja (no bloquea el cierre si falla)
- Token enmascarado en la UI por seguridad

#### Repo de backup:
- Owner: `ricandico`
- Repo: `resguardocasacaribe`
- URL: `https://github.com/ricandico/resguardocasacaribe`

### 5. Usuarios actuales en la BD
| ID | Usuario | Contraseña | Rol |
|----|---------|-----------|-----|
| 3 | vero | 051081 | vendedor |
| 4 | ceci | 12345 | admin |
| 5 | rick | 220179 | admin |

### 6. Archivos importantes
- Instalador: `C:\Users\casac\Desktop\Casa Caribe POS Setup.exe`
- Repo local: `C:\Users\casac\casacaribe`
- DB de la app: `C:\Users\casac\AppData\Roaming\casacaribe-pos\panaderia.db`
- Config backup: `C:\Users\casac\AppData\Roaming\casacaribe-pos\backup-config.json`

---

## Comandos útiles

```bash
# Abrir la app
cd C:\Users\casac\casacaribe && pnpm run start

# Recompilar instalador
pnpm run dist:win

# Revisar usuarios en la DB
npx electron dump_users.cjs

# Verificar versiones
node -v
pnpm -v
git --version
opencode --version
```

---

## Stack de la app
- **Electron** 42.4.0 (desktop runtime)
- **better-sqlite3** 12.11.1 (base de datos SQLite local)
- **Vanilla HTML/CSS/JS** (sin frameworks)
- **electron-builder** 26.15.3 (generador de instaladores)
- Locale: `es-AR` (español argentino)
