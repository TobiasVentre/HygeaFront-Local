import { DoctorView } from "./view/doctor.js";
import { PatientView } from "./view/patient.js";
import { clearElement } from "./utils/domUtils.js";

function initDemoNavigation() {
  const buttons = document.querySelectorAll(".demo-nav .demo-btn");
  const container = document.querySelector(".dashboard-content");

  if (!container) {
    console.error("No se encontró el contenedor .dashboard-content");
    return;
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      // 🔸 Si es el botón de Landing, dejamos que el enlace funcione normalmente
      if (btn.getAttribute("href") && btn.getAttribute("href").includes("CuidarMed.html")) {
        return; // no prevenimos el comportamiento por defecto
      }

      e.preventDefault(); // para los demás, sí evitamos recarga

      // Cambiar botón activo
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Limpiar contenedor
      clearElement(container);

      // Obtener vista desde data-view
      const view = btn.dataset.view;

      switch (view) {
        case "doctor":
          await DoctorView();
          break;
        case "patient":
          await PatientView();
          break;
        case "login":
          container.innerHTML = "<h2>Pantalla de Login (en desarrollo)</h2>";
          break;
        case "registro":
          container.innerHTML = "<h2>Pantalla de Registro (en desarrollo)</h2>";
          break;
        default:
          container.innerHTML = "<h2>Vista en construcción</h2>";
          break;
      }
    });
  });
}

// Autoejecución
document.addEventListener("DOMContentLoaded", () => {
  initDemoNavigation();

  // Cargar vista inicial
  DoctorView();
});
