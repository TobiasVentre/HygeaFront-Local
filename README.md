# CuidarMed+ Frontend

## Ejecutar el Frontend Localmente

El frontend utiliza módulos ES6, por lo que necesita ejecutarse a través de un servidor HTTP local.

### Opción 1: Usando los Scripts Incluidos (Recomendado)

**Windows PowerShell:**
```powershell
.\start-server.ps1
```

**Windows CMD:**
```cmd
start-server.bat
```

### Opción 2: Usando Python

```bash
cd Frontend
python -m http.server 8000
```

Luego abre tu navegador en: **http://localhost:8000**

### Opción 3: Usando Node.js

```bash
cd Frontend
npx http-server -p 8000
```

Luego abre tu navegador en: **http://localhost:8000**

### Opción 4: Usando Live Server (VS Code)

1. Instala la extensión "Live Server" en VS Code
2. Haz clic derecho en `index.html`
3. Selecciona "Open with Live Server"

## Estructura del Proyecto

- `index.html` - Página principal
- `login.html` - Página de inicio de sesión
- `registro.html` - Página de registro
- `patient.html` - Panel del paciente
- `doctor.html` - Panel del doctor
- `css/` - Estilos CSS
- `js/` - Scripts JavaScript
- `assets/` - Imágenes y recursos

## Notas

- El frontend se conecta a los microservicios backend en los puertos:
  - DirectoryMS: 8081 (Docker) o 5112 (IIS Express)
  - AuthMS: 8082 (Docker) o 5093 (IIS Express)
  - SchedulingMS: 8083 (Docker) o 34372/5140 (IIS Express/Development)
  - ClinicalMS: 8084 (Docker) o 27124/5073 (IIS Express/Development)

- Asegúrate de que los servicios backend estén ejecutándose para que el frontend funcione completamente.

