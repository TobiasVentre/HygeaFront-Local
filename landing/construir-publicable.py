"""
Arma las versiones autocontenidas de la landing para publicar como Artifact.

Un Artifact es una sola pagina: no puede tomar CSS ni JS de archivos vecinos.
Este script toma las paginas de `opcion-a/` y `opcion-b/`, les mete adentro
`assets/base.css`, su propio `estilos.css` y `assets/embudo.js`, y saca el
envoltorio (`<!doctype>`, `<html>`, `<head>`, `<body>`) porque el publicador
pone el suyo. Tambien arma el selector, apuntando a las URL ya publicadas.

Uso:  python construir-publicable.py
Salida: publicable/opcion-a.html, publicable/opcion-b.html, publicable/selector.html
"""

import pathlib
import re

RAIZ = pathlib.Path(__file__).parent
SALIDA = RAIZ / "publicable"

SALTO = "\n"

FUENTES = (
    '<link rel="stylesheet" '
    'href="https://fonts.googleapis.com/css2?'
    'family=Karla:wght@400;500;600;700&family=Rubik:wght@400;500;600;700&display=swap">'
)

PAGINAS = [
    ("opcion-a", "Hygea Go Opción A"),
    ("opcion-b", "Hygea Go Opción B"),
]

# URLs de las dos opciones ya publicadas. El selector publicado tiene que
# apuntar ahi: dentro de un Artifact no existen las rutas vecinas.
PUBLICADAS = {
    "opcion-a/index.html": "https://claude.ai/code/artifact/ca17f54a-9634-4b44-acb3-59baad45c4f8",
    "opcion-b/index.html": "https://claude.ai/code/artifact/8c9e476d-88e2-4ffa-9b61-fc0c9bce5ddb",
}


def cuerpo(html):
    """Devuelve lo que va entre <body> y </body>."""
    inicio = html.index("<body>") + len("<body>")
    fin = html.rindex("</body>")
    return html[inicio:fin]


def armar(titulo, css, contenido):
    partes = [
        "<title>%s</title>" % titulo,
        FUENTES,
        "<style>" + SALTO + css + "</style>",
        contenido.strip(),
    ]
    return SALTO.join(partes) + SALTO


def sin_rutas_relativas(texto, nombre):
    sueltas = re.findall(r'(?:href|src)="(?!https?:|#|mailto:|tel:)([^"]+)"', texto)
    assert not sueltas, (nombre, sueltas)


def construir_pagina(carpeta, titulo):
    pagina = (RAIZ / carpeta / "index.html").read_text(encoding="utf-8")
    base = (RAIZ / "assets" / "base.css").read_text(encoding="utf-8")
    estilos = (RAIZ / carpeta / "estilos.css").read_text(encoding="utf-8")
    embudo = (RAIZ / "assets" / "embudo.js").read_text(encoding="utf-8")

    contenido = cuerpo(pagina).replace(
        '<script src="../assets/embudo.js"></script>',
        "<script>" + SALTO + embudo + "</script>",
    )
    assert "assets/embudo.js" not in contenido, carpeta

    return armar(titulo, base + SALTO + estilos, contenido)


def construir_selector():
    pagina = (RAIZ / "index.html").read_text(encoding="utf-8")
    base = (RAIZ / "assets" / "base.css").read_text(encoding="utf-8")
    propios = re.search(r"<style>(.*?)</style>", pagina, re.S).group(1)

    contenido = cuerpo(pagina)
    for relativa, url in PUBLICADAS.items():
        contenido = contenido.replace(
            'href="%s"' % relativa,
            'href="%s" target="_blank" rel="noopener"' % url,
        )

    return armar("Propuestas de landing Hygea Go", base + SALTO + propios, contenido)


def main():
    SALIDA.mkdir(exist_ok=True)

    trabajos = [(c + ".html", construir_pagina(c, t)) for c, t in PAGINAS]
    trabajos.append(("selector.html", construir_selector()))

    for nombre, texto in trabajos:
        sin_rutas_relativas(texto, nombre)
        (SALIDA / nombre).write_text(texto, encoding="utf-8")
        print("%s  %d KB" % (nombre, len(texto.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
