# Hygea Frontend

## Ejecutar localmente

El frontend usa modulos ES6, por lo que debe ejecutarse con un servidor HTTP local.

### Opcion 1 (recomendada)

PowerShell:

```powershell
.\start-server.ps1
```

CMD:

```cmd
start-server.bat
```

Luego abrir: `http://localhost:8000`

### Opcion 2

```bash
cd Frontend
python -m http.server 8000
```

## Microservicios (local)

- AuthMS: `http://localhost:5101/api/v1`
- DirectoryMS: `http://localhost:5102/api`
- CatalogMS: `http://localhost:5103/api`
- SchedulingMS: `http://localhost:8083/api/v1` (temporal/historico)

La configuracion central de endpoints esta en:

- `js/config/services.config.js`

La capa de acceso HTTP esta en:

- `js/api.js`
- `js/apis/authms.js`
- `js/apis/directoryms.js`
- `js/apis/catalogms.js`

## Estado de integracion

- AuthMS: integrado.
- DirectoryMS: requiere migracion de rutas legacy a `client-profiles` / `technician-profiles`.
- CatalogMS: cliente API agregado, falta consumirlo en UI.
- SchedulingMS: hay llamadas existentes, pendiente alineacion final con contrato nuevo.
