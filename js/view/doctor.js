import { Api } from "../api.js";
import { clearElement, createElement, showMessage } from "../utils/domUtils.js";

/**
 * Renderiza la vista del doctor dentro del contenedor principal.
 */
export async function DoctorView() {
  const container = document.querySelector(".dashboard-content");
  if (!container) {
    console.error("No se encontró el contenedor .dashboard-content");
    return;
  }

  clearElement(container);

  const doctorId = 1;
  const endpoint = `v1/Doctor/${doctorId}`;

  try {
    const doctor = await Api.get(endpoint);
    if (!doctor || !doctor.firstName || !doctor.lastName) {
      showMessage("No se pudieron obtener los datos del doctor.", "error");
      return;
    }

    const fullName = `${doctor.firstName} ${doctor.lastName}`;

    // ---------- 1. Título principal ----------
    const title = createElement("h1", {
      className: "dashboard-title",
      textContent: "Vista del Médico",
    });

    // ---------- 2. Sección de bienvenida ----------
    const welcomeSection = createElement("div", { className: "welcome-section" }, [
      createElement("h2", { textContent: `Bienvenido, Dr. ${fullName}` }),
      createElement("p", { textContent: "Panel de gestión médica" }),
    ]);

    // ---------- 3. Tarjetas resumen ----------
    const summaryCards = createElement("div", { className: "summary-cards" }, [
      createSummaryCard("fas fa-users", "4", "Consultas programadas"),
      createSummaryCard("fas fa-calendar", "35", "Turnos asignados"),
      createSummaryCard("fas fa-clock", "1", "Consulta activa"),
      createSummaryCard("fas fa-file-medical", "8", "Emitidas hoy"),
    ]);

    // ---------- 4. Consultas de hoy ----------
    const consultasHoy = createElement("div", { className: "dashboard-section" }, [
      createElement("div", { className: "section-header" }, [
        createElement("h3", { textContent: "Consultas de Hoy" }),
        createElement("p", { textContent: "Agenda del día" }),
      ]),
      createElement("div", { className: "consultations-list", id: "consultations-list" }, [
        createConsultation("Juan Pérez", "Primera consulta", "09:00", "waiting"),
        createConsultation("María González", "Control", "10:00", "in-progress"),
        createConsultation("Carlos López", "Seguimiento", "11:00", "pending"),
        createConsultation("Ana Martínez", "Control", "14:00", "pending"),
      ]),
    ]);

    // ---------- 5. Agenda semanal ----------
    const agendaSemanal = createElement("div", { className: "dashboard-section" }, [
      createElement("div", { className: "section-header" }, [
        createElement("h3", { textContent: "Agenda Semanal" }),
        createElement("p", { textContent: "Vista general de la semana" }),
      ]),
      createElement("div", { className: "weekly-schedule", id: "weekly-schedule" }, [
        createScheduleItem("Lun 11", "8 consultas"),
        createScheduleItem("Mar 12", "6 consultas"),
        createScheduleItem("Mié 13", "7 consultas"),
        createScheduleItem("Jue 14", "9 consultas"),
        createScheduleItem("Vie 15", "5 consultas"),
      ]),
    ]);

    const dashboardGrid = createElement("div", { className: "dashboard-grid" }, [
      consultasHoy,
      agendaSemanal,
    ]);

    // ---------- 6. Acciones rápidas ----------
    const quickActions = createElement("div", { className: "quick-actions" }, [
      createElement("h3", { textContent: "Acciones Rápidas" }),
      createElement("div", { className: "actions-grid" }, [
        createQuickAction("issue-prescription-btn", "fas fa-file-medical", "Emitir Receta"),
        createQuickAction("view-patients-btn", "fas fa-users", "Ver Pacientes"),
        createQuickAction("manage-schedule-btn", "fas fa-calendar", "Gestionar Agenda"),
      ]),
    ]);

    // ---------- 7. Agregar todo al contenedor ----------
    container.append(
      title,
      welcomeSection,
      summaryCards,
      dashboardGrid,
      quickActions
    );

    showMessage(`Datos cargados para Dr. ${fullName}`, "success");
  } catch (error) {
    console.error("Error al obtener datos del doctor:", error);
    showMessage("Error al cargar los datos del doctor.", "error");
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

function createConsultation(name, type, time, status) {
  return createElement("div", { className: "consultation-item" }, [
    createElement("div", { className: "consultation-icon" }, [
      createElement("i", { className: "fas fa-clock" }),
    ]),
    createElement("div", { className: "consultation-info" }, [
      createElement("h4", { textContent: name }),
      createElement("p", { textContent: type }),
      createElement("span", { textContent: time }),
    ]),
    createElement("div", { className: "consultation-actions" }, [
      createElement("span", { className: `status ${status}`, textContent: getStatusText(status) }),
      createElement("button", {
        className: "btn btn-primary attend-btn",
        "data-patient": name,
        innerHTML: `<i class="fas fa-play"></i> Atender`,
      }),
    ]),
  ]);
}

function getStatusText(status) {
  switch (status) {
    case "waiting":
      return "En espera";
    case "in-progress":
      return "En curso";
    case "pending":
      return "Pendiente";
    default:
      return "Desconocido";
  }
}

function createScheduleItem(day, count) {
  return createElement("div", { className: "schedule-item" }, [
    createElement("i", { className: "fas fa-calendar" }),
    createElement("span", { textContent: day }),
    createElement("span", { textContent: count }),
    createElement("i", { className: "fas fa-chevron-right" }),
  ]);
}

function createQuickAction(id, iconClass, label) {
  return createElement("button", { className: "action-btn", id }, [
    createElement("i", { className: iconClass }),
    createElement("span", { textContent: label }),
  ]);
}

// Autoejecución
document.addEventListener("DOMContentLoaded", () => {
  DoctorView();
});
