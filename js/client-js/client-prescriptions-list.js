// ============================================
// LISTADO DE RECETAS - CLIENTE
// ============================================

import { appState } from './client-state.js';
import { showNotification } from './client-notifications.js';

/**
 * Carga y renderiza la lista completa de recetas del cliente
 */
export async function loadClientPrescriptions() {
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
        const clientId = appState.currentClient?.clientId;
        if (!clientId) return;

        const { ApiClinical, Api } = await import('../api.js');

        // Traer recetas del cliente
        let prescriptions = await ApiClinical.get(`v1/Prescription/client/${clientId}`);
        if (!Array.isArray(prescriptions)) prescriptions = prescriptions?.value || [];

        if (!prescriptions.length) {
            container.innerHTML = `<p>No hay recetas disponibles</p>`;
            return;
        }

        // Obtener FUMIGATORES únicos
        const fumigatorIds = [...new Set(prescriptions.map(p => p.fumigatorId).filter(Boolean))];
        const fumigatorsMap = new Map();

        for (const fumigatorId of fumigatorIds) {
            try {
                const fumigator = await Api.get(`v1/technician/${fumigatorId}`);

                fumigatorsMap.set(fumigatorId, {
                    name: `Dr. ${fumigator.firstName} ${fumigator.lastName}`,
                    specialty: fumigator.specialty || fumigator.Specialty || "",
                    matricula: fumigator.licenseNumber || fumigator.LicenseNumber || ""
                });

            } catch (err) {
                fumigatorsMap.set(fumigatorId, {
                    name: `Dr. ${fumigatorId}`,
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

            // Información del fumigator
            const fumigatorData = fumigatorsMap.get(p.fumigatorId) || {
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

            // Nombre del fumigator
            clone.querySelector('.prescription-fumigator').textContent = fumigatorData.name;

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
                    fumigatorName: fumigatorData.name,
                    fumigatorSpecialty: fumigatorData.specialty,
                    fumigatorMatricula: fumigatorData.matricula
                };

                downloadPrescriptionPDF(prescriptionData);
            });

            container.appendChild(clone);
        });

    } catch (error) {
        console.error('Error al cargar recetas :', error);
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
    // ENCABEZADO Hygea
    // ==============================
    doc.setTextColor(37, 99, 235); // Azul profesional
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.text("Hygea", margin, y);

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
    doc.text(`Dr/a. ${prescription.fumigatorName || "No especificado"}`, margin, y);

    y += 6;

    if (prescription.fumigatorSpecialty) {
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(prescription.fumigatorSpecialty, margin, y);
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

    // FIRMA DEL FUMIGATOR
    doc.setDrawColor(156, 163, 175);
    doc.line(margin, y, margin + 70, y);
    y += 8;

    doc.setFont(undefined, "bold");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text(`Dr/a. ${prescription.fumigatorName}`, margin, y);

    y += 5;

    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(
        `Matrícula Profesional: ${prescription.fumigatorMatricula || "No disponible"}`,
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
        `Hygea - Sistema de Gestión Médica | Documento generado el ${new Date().toLocaleDateString("es-AR")}`,
        margin,
        footerY
    );

    // DESCARGA
    doc.save(`Receta_${prescription.encounterId || "0"}.pdf`);
}




// Exportar a window para uso de onclick
window.loadClientPrescriptions = loadClientPrescriptions;

