// ============================================
// LISTADO DE RECETAS MÉDICAS - PACIENTE
// ============================================

import { appState } from './patient-state.js';
import { showNotification } from './patient-notifications.js';

/**
 * Carga y renderiza la lista completa de recetas del paciente
 */
export async function loadPatientPrescriptions() {
    // Ocultar sección de inicio
    const homeSection = document.getElementById('inicio');
    if (homeSection) homeSection.style.display = 'none';

    // Mostrar sección de recetas
    const prescriptionsSection = document.getElementById('recetas');
    if (prescriptionsSection) prescriptionsSection.style.display = 'block';

    const container = document.getElementById('prescriptions-list-full');
    if (!container) return;

    container.innerHTML = '';

    try {
        const patientId = appState.currentPatient?.patientId;
        if (!patientId) return;

        const { ApiClinical, Api } = await import('../api.js');

        // Traer recetas del paciente
        let prescriptions = await ApiClinical.get(`v1/Prescription/patient/${patientId}`);
        if (!Array.isArray(prescriptions)) prescriptions = prescriptions?.value || [];

        if (!prescriptions.length) {
            container.innerHTML = `<p>No hay recetas disponibles</p>`;
            return;
        }

        // Obtener DOCTORES únicos
        const doctorIds = [...new Set(prescriptions.map(p => p.doctorId).filter(Boolean))];
        const doctorsMap = new Map();

        for (const doctorId of doctorIds) {
            try {
                const doctor = await Api.get(`v1/Doctor/${doctorId}`);

                doctorsMap.set(doctorId, {
                    name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
                    specialty: doctor.specialty || doctor.Specialty || "",
                    matricula: doctor.licenseNumber || doctor.LicenseNumber || ""
                });

            } catch (err) {
                doctorsMap.set(doctorId, {
                    name: `Dr. ${doctorId}`,
                    specialty: "",
                    matricula: ""
                });
            }
        }

        // Renderizar las cards usando template
        const template = document.getElementById('template-prescription-card');
        if (!template) return;

        prescriptions.forEach(p => {
            const clone = template.content.cloneNode(true);

            // Información del doctor
            const doctorData = doctorsMap.get(p.doctorId) || {
                name: "Dr. Desconocido",
                specialty: "",
                matricula: ""
            };

            // Llenar datos visibles
            // Si encounterId es 0 o no existe, mostrar "Receta directa", sino "Consulta #X"
            const encounterId = p.encounterId || p.EncounterId;
            const titleText = (encounterId && encounterId > 0) 
                ? `Consulta #${encounterId}` 
                : 'Receta directa';
            clone.querySelector('.prescription-card-title').textContent = titleText;
            clone.querySelector('.prescription-diagnosis').textContent = p.diagnosis || 'No especificado';
            clone.querySelector('.prescription-medication').textContent = p.medication || 'No especificado';
            clone.querySelector('.prescription-dosage').textContent = p.dosage || 'No especificada';
            clone.querySelector('.prescription-frequency').textContent = p.frequency || 'No especificada';
            clone.querySelector('.prescription-duration').textContent = p.duration || 'No especificada';
            clone.querySelector('.prescription-instructions').textContent = p.additionalInstructions || 'Sin instrucciones adicionales';

            // Nombre del doctor
            clone.querySelector('.prescription-doctor').textContent = doctorData.name;

            // Fecha
            const dateStr = new Date(p.prescriptionDate || p.createdAt).toLocaleDateString('es-AR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            clone.querySelector('.prescription-date').textContent = dateStr;

            // Botón de PDF → pasar todos los datos completos
            const btn = clone.querySelector('.btn-prescription-view');
            btn.addEventListener('click', () => {
                const prescriptionData = {
                    ...p,
                    doctorName: doctorData.name,
                    doctorSpecialty: doctorData.specialty,
                    doctorMatricula: doctorData.matricula
                };

                downloadPrescriptionPDF(prescriptionData);
            });

            container.appendChild(clone);
        });

    } catch (error) {
        console.error('Error al cargar recetas médicas:', error);
        container.innerHTML = `<p>No se pudieron cargar las recetas.</p>`;
    }
}


async function downloadPrescriptionPDF(prescription) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const margin = 20;
    let y = 20;
    const pageWidth = doc.internal.pageSize.getWidth();

    // ==============================
    // ENCABEZADO CUIDARMED+
    // ==============================
    doc.setTextColor(37, 99, 235); // Azul profesional
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.text("CuidarMed+", margin, y);

    y += 10;

    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);

    y += 15;

    // Subtítulo
    doc.setTextColor(75, 85, 99);
    doc.setFontSize(14);
    doc.setFont(undefined, 'normal');
    doc.text("Receta Médica", margin, y);

    y += 15;

    // INFORMACIÓN DEL MÉDICO
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Dr/a. ${prescription.doctorName || "No especificado"}`, margin, y);

    y += 6;

    if (prescription.doctorSpecialty) {
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(prescription.doctorSpecialty, margin, y);
        y += 6;
    }

    y += 10;

    // Fecha
    const formattedDate = new Date(
        prescription.prescriptionDate || prescription.createdAt
    ).toLocaleDateString("es-AR", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    doc.text(`Fecha: ${formattedDate}`, margin, y);

    y += 12;

    // SEPARADOR
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);

    y += 12;

    // FUNCIÓN DE SECCIONES
    const addSection = (title, content) => {
        if (!content || content === "No especificado" || content === "No especificada") return;

        doc.setTextColor(31, 41, 55);
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.text(title, margin, y);
        y += 6;

        doc.setFont(undefined, "normal");
        doc.setTextColor(55, 65, 81);
        doc.setFontSize(10);

        const lines = doc.splitTextToSize(content, pageWidth - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * 5 + 6;
    };


    // CONTENIDO
    addSection("Diagnóstico", prescription.diagnosis);
    addSection("Medicamento", prescription.medication);
    addSection("Dosis", prescription.dosage);
    addSection("Frecuencia", prescription.frequency);
    addSection("Duración", prescription.duration);
    addSection("Instrucciones Adicionales", prescription.additionalInstructions);

    y += 10;

    // FIRMA DEL DOCTOR
    doc.setDrawColor(156, 163, 175);
    doc.line(margin, y, margin + 70, y);
    y += 8;

    doc.setFont(undefined, "bold");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text(`Dr/a. ${prescription.doctorName}`, margin, y);

    y += 5;

    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(
        `Matrícula Profesional: ${prescription.doctorMatricula || "No disponible"}`,
        margin,
        y
    );

    // FOOTER
    const footerY = 285;

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(
        `CuidarMed+ - Sistema de Gestión Médica | Documento generado el ${new Date().toLocaleDateString("es-AR")}`,
        margin,
        footerY
    );

    // DESCARGA
    doc.save(`Receta_${prescription.encounterId || "0"}.pdf`);
}




// Exportar a window para uso de onclick
window.loadPatientPrescriptions = loadPatientPrescriptions;

