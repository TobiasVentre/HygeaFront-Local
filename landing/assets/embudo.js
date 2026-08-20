/* ------------------------------------------------------------------
   Embudo comercial de la landing.

   No hay backend donde guardar el lead todavia, asi que el formulario
   arma un mensaje de WhatsApp ya escrito y abre la conversacion. El
   usuario ve lo que va a mandar antes de enviarlo, y del lado de Hygea
   entra por el mismo canal que ya usan.

   Cuando exista un endpoint real, se reemplaza `entregar()` por un
   fetch y el resto del formulario queda igual.
   ------------------------------------------------------------------ */

(function () {
    "use strict";

    var TELEFONO = "5491170646658";

    var formulario = document.getElementById("embudo");
    if (!formulario) { return; }

    var aviso = document.getElementById("embudo-aviso");

    var CAMPOS = [
        { nombre: "servicio", etiqueta: "Servicio" },
        { nombre: "lugar", etiqueta: "Lugar" },
        { nombre: "zona", etiqueta: "Zona" },
        { nombre: "cuando", etiqueta: "Cuándo" },
        { nombre: "nombre", etiqueta: "Nombre" },
        { nombre: "telefono", etiqueta: "Teléfono" }
    ];

    function valor(nombre) {
        var campo = formulario.elements[nombre];
        return campo && campo.value ? campo.value.trim() : "";
    }

    function marcarError(campo, hayError) {
        campo.setAttribute("aria-invalid", hayError ? "true" : "false");
        campo.closest(".embudo__campo").classList.toggle("con-error", hayError);
    }

    function primerFaltante() {
        var faltante = null;
        CAMPOS.forEach(function (dato) {
            var campo = formulario.elements[dato.nombre];
            if (!campo) { return; }
            var vacio = !campo.value.trim();
            marcarError(campo, vacio);
            if (vacio && !faltante) { faltante = campo; }
        });
        return faltante;
    }

    function armarMensaje() {
        var lineas = ["Hola Hygea, quiero pedir un servicio."];
        lineas.push("");
        CAMPOS.forEach(function (dato) {
            lineas.push(dato.etiqueta + ": " + valor(dato.nombre));
        });
        var detalle = valor("detalle");
        if (detalle) {
            lineas.push("");
            lineas.push("Detalle: " + detalle);
        }
        lineas.push("");
        lineas.push("(Enviado desde la web de Hygea Go)");
        return lineas.join("\n");
    }

    function entregar(mensaje) {
        var url = "https://wa.me/" + TELEFONO + "?text=" + encodeURIComponent(mensaje);
        var ventana = window.open(url, "_blank", "noopener");
        if (!ventana) { window.location.href = url; }
    }

    formulario.addEventListener("submit", function (evento) {
        evento.preventDefault();

        var faltante = primerFaltante();
        if (faltante) {
            aviso.textContent = "Nos falta un dato para poder contactarte. Completá lo que quedó marcado.";
            aviso.classList.add("visible");
            faltante.focus();
            return;
        }

        aviso.textContent = "Listo. Abrimos WhatsApp con el mensaje ya escrito para que lo revises antes de enviarlo.";
        aviso.classList.remove("visible");
        aviso.classList.add("visible", "es-ok");

        entregar(armarMensaje());
    });

    formulario.addEventListener("input", function (evento) {
        var campo = evento.target;
        if (campo.closest && campo.closest(".embudo__campo")) {
            marcarError(campo, false);
        }
    });
})();
