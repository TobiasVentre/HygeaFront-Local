# Landing institucional de Hygea Go

Dos propuestas para validar con el cliente antes de publicar en `hygeago.com.ar`.
Sitio estático: HTML y CSS, sin build step ni dependencias. Lo único externo son las
tipografías de Google Fonts (Karla y Rubik, las mismas de `hygeagroup.com.ar`).

## Ver localmente

```
.\servir.ps1
```

o doble clic en `servir.cmd`. Después abrir <http://localhost:8090>: se ve un selector
con las dos opciones.

También se pueden abrir los archivos con doble clic, pero conviene el servidor para que
las rutas relativas se comporten igual que en producción.

## Qué hay acá

| Ruta | Qué es |
|---|---|
| `index.html` | Selector para comparar las dos propuestas. No forma parte del sitio final. |
| `opcion-a/` | Institucional clara: fondo blanco, tarjetas, mucho aire. |
| `opcion-b/` | Producto en primer plano: hero azul profundo, lista editorial, franjas alternadas. |
| `assets/base.css` | Tokens de color, tipografías y reset compartidos por las dos. |
| `assets/embudo.js` | Lógica del formulario de contacto. |
| `assets/favicon.svg` | Isotipo (casa con gota), el mismo de la app, en azul corporativo. |
| `construir-publicable.py` | Arma las copias autocontenidas para publicar. |
| `publicable/` | Salida del script. Generada: no se edita a mano. |
| `robots.txt` | Bloquea la indexación mientras haya dos versiones publicadas. |

## Decisiones de marca

Paleta puente entre el sitio corporativo y el producto:

- **Azul corporativo `#004AAD`** — marca, títulos, fondos oscuros. Sale de `hygeagroup.com.ar`.
- **Azul de producto `#2563EB`** — llamados a la acción y todo lo que representa la app.
  Es el mismo `--brand` de `Frontend/css/theme.css`.
- **Lima `#B7C523` / `#D3E220`** — acento. En la opción A aparece en dosis chicas; en la B
  es protagonista.
- Tipografías **Rubik** (títulos) y **Karla** (texto), las que ya usa el sitio corporativo.

## Antes de publicar

- **Los números hay que confirmarlos.** +15 años, +1.000 clientes, +2.500 trabajos y
  +10 técnicos están tomados del sitio actual.
- **Las redes apuntan al perfil genérico.** Faltan las URL reales de Instagram y LinkedIn.
- **No hay fotos propias.** Todo está resuelto con tipografía, color y una maqueta de la
  app. Si el cliente aporta fotos de campo, entran sin rehacer el diseño.
- **El texto dice explícitamente que el pago no pasa por la plataforma**, porque hoy no
  existe esa función. Si en algún momento se integra un medio de pago, hay que revisar la
  pregunta frecuente correspondiente y la sección de planes.
- Los botones "Ingresar" y "Crear mi cuenta" apuntan a `https://app.hygeago.com.ar`.

## El formulario de contacto

La sección de cierre tiene un formulario de seis campos (servicio, tipo de lugar, zona,
urgencia, nombre y teléfono, más un detalle opcional). **No hay backend donde guardar el
lead**, así que al enviar arma un mensaje de WhatsApp ya escrito y abre la conversación con
`wa.me`. La persona ve lo que va a mandar antes de enviarlo.

Consecuencia a tener presente: si alguien completa el formulario y no llega a enviar el
mensaje, ese lead se pierde. No hay registro de intentos.

Para pasarlo a captura real hay que tocar una sola función, `entregar()` en
`assets/embudo.js`, y reemplazar la apertura de WhatsApp por un `fetch` al endpoint que
corresponda. El resto del formulario (campos, validación, armado del mensaje) queda igual.
Las alternativas, de menor a mayor trabajo: un servicio externo tipo Formspree; un endpoint
propio en el backend; o crear directamente la orden de servicio en la plataforma.

## Publicar para revisar

```
python construir-publicable.py
```

Genera en `publicable/` una copia de cada página con el CSS y el JS metidos adentro, porque
un Artifact es un archivo solo y no puede leer archivos vecinos. Esas copias son las que se
publican; el original sigue siendo el de `opcion-a/` y `opcion-b/`.

Versiones publicadas (privadas hasta que se compartan desde el menú de la página):

- Selector: <https://claude.ai/code/artifact/3e87a34b-0438-4f8a-805f-f3cd66b68106>
- Opción A: <https://claude.ai/code/artifact/ca17f54a-9634-4b44-acb3-59baad45c4f8>
- Opción B: <https://claude.ai/code/artifact/8c9e476d-88e2-4ffa-9b61-fc0c9bce5ddb>

Si se cambia algo, hay que volver a correr el script y republicar cada archivo sobre su
misma URL, para no generar direcciones nuevas.

## Deploy a hygeago.com.ar

Esta carpeta viaja dentro del repo del frontend, pero **no se sirve junto con la app**:
`publish_frontend` la excluye del rsync a `/opt/hygea/frontend`, y el componente `Landing`
del pipeline la manda a `/opt/hygea/landing`, que es lo que sirve `hygeago.com.ar`.

Para deployarla:

```
gh workflow run deploy-droplet.yml --repo TobiasVentre/HygeaDeploy -f component=Landing
```

La configuración del pipeline y el bloque de nginx viven en el repo
[TobiasVentre/HygeaDeploy](https://github.com/TobiasVentre/HygeaDeploy):
`deploy/nginx/hygeago-landing.conf` y `deploy/RUNBOOK-landing.md`.
