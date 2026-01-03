import { Api } from "../api.js";
import { clearElement, createElement, showMessage } from "../utils/domUtils.js";

/**
 * Renderiza la vista del paciente dentro del contenedor principal.
 */
export async function PatientView() {
  const container = document.querySelector(".dashboard-content");
  if (!container) {
    console.error("No se encontró el contenedor .dashboard-content");
    return;
  }

  clearElement(container);

  const patientId = 1;
  const endpoint = `v1/Patient/${patientId}`;

  try {
    const patient = await Api.get(endpoint);
    if (!patient || !patient.name) {
      showMessage("No se pudieron obtener los datos del paciente.", "error");
      return;
    }

    const fullName = `${patient.name} ${patient.lastName}`;

    // ---------- 1. Título principal ----------
    const title = createElement("h1", {
      className: "dashboard-title",
      textContent: "Vista del Paciente",
    });

    // ---------- 2. Sección de bienvenida ----------
    const welcomeSection = createElement("div", { className: "welcome-section" }, [
      createElement("h2", { textContent: `Bienvenido, ${patient.name}` }),
      createElement("p", { textContent: "Aquí está el resumen de tu atención médica" }),
    ]);

    // ---------- 3. Tarjetas resumen ----------
    const summaryCards = createElement("div", { className: "summary-cards" }, [
      createSummaryCard("fas fa-calendar", "2", "Turnos confirmados"),
      createSummaryCard("fas fa-check-circle", "12", "Este año"),
      createSummaryCard("fas fa-pills", "3", "Disponibles"),
    ]);

    // ---------- 4. Próximos turnos ----------
    const sectionTurnos = createElement("div", { className: "dashboard-section" }, [
      createElement("div", { className: "section-header" }, [
        createElement("h3", { textContent: "Próximos Turnos" }),
        createElement("p", { textContent: "Tus consultas programadas" }),
        createElement("button", {
          className: "btn btn-primary",
          id: "schedule-appointment-btn",
          innerHTML: `<i class="fas fa-calendar-plus"></i> Agendar Turno`,
        }),
      ]),
      createElement("div", { className: "appointments-list", id: "appointments-list" }, [
        createAppointmentCard(
          "Dr. María González",
          "Cardiología",
          "2025-10-15 - 10:00",
          "confirmed"
        ),
        createAppointmentCard(
          "Dr. Carlos Rodríguez",
          "Traumatología",
          "2025-10-18 - 15:30",
          "pending"
        ),
      ]),
    ]);

    // ---------- 5. Historial médico ----------
    const sectionHistorial = createElement("div", { className: "dashboard-section" }, [
      createElement("div", { className: "section-header" }, [
        createElement("h3", { textContent: "Historial Médico Reciente" }),
        createElement("p", { textContent: "Últimas consultas realizadas" }),
      ]),
      createElement("div", { className: "history-list", id: "history-list" }, [
        createHistoryItem(
          "2025-09-20",
          "Dr. Ana Martinez",
          "Control rutinario"
        ),
        createHistoryItem(
          "2025-08-15",
          "Dr. Juan López",
          "Consulta dermatológica"
        ),
      ]),
    ]);

    // ---------- 6. Agregar todo al contenedor ----------
    container.append(title, welcomeSection, summaryCards, sectionTurnos, sectionHistorial);

    showMessage(`Datos cargados para ${fullName}`, "success");
  } catch (error) {
    console.error("Error al obtener datos del paciente:", error);
    showMessage("Error al cargar los datos del paciente.", "error");
  }
}

// ---------- Funciones auxiliares ----------

function createSummaryCard(iconClass, number, label) {
  return createElement("div", { className: "summary-card" }, [
    createElement("div", { className: "card-icon" }, [
      createElement("i", { className: iconClass }),
    ]),
    createElement("div", { className: "card-content" }, [
      createElement("span", { className: "card-number", textContent: number }),
      createElement("span", { className: "card-label", textContent: label }),
    ]),
  ]);
}

function createAppointmentCard(doctor, specialty, dateTime, status) {
  return createElement("div", { className: "appointment-card" }, [
    createElement("div", { className: "appointment-icon" }, [
      createElement("i", { className: "fas fa-calendar" }),
    ]),
    createElement("div", { className: "appointment-info" }, [
      createElement("h4", { textContent: doctor }),
      createElement("p", { textContent: specialty }),
      createElement("span", { textContent: dateTime }),
    ]),
    createElement("div", { className: "appointment-actions" }, [
      createElement("span", {
        className: `status ${status}`,
        textContent: getAppointmentStatusText(status),
      }),
      createElement("button", {
        className: "btn btn-secondary video-call-btn",
        "data-doctor": doctor,
        innerHTML: `<i class="fas fa-video"></i> Videollamada`,
      }),
    ]),
  ]);
}

function getAppointmentStatusText(status) {
  switch (status) {
    case "confirmed":
      return "Confirmado";
    case "pending":
      return "Pendiente";
    default:
      return "Desconocido";
  }
}

function createHistoryItem(date, doctor, description) {
  return createElement("div", { className: "history-item" }, [
    createElement("div", { className: "history-info" }, [
      createElement("h4", { textContent: `${date} ${doctor}` }),
      createElement("p", { textContent: description }),
    ]),
    createElement("button", {
      className: "btn btn-secondary view-prescription-btn",
      "data-consultation": date,
      innerHTML: `<i class="fas fa-file-medical"></i> Ver Receta`,
    }),
  ]);
}

// Autoejecución
document.addEventListener("DOMContentLoaded", () => {
  PatientView();
});
