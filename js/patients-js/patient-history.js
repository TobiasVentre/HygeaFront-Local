import { appState } from './patient-state.js';

/** Cargar historial completo */
export async function loadPatientHistoryFull() {
    const container = document.getElementById('history-list-full');
    if (!container) return;

    container.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Cargando historial médico...</p></div>`;

    try {
        const patientId = appState.currentPatient?.patientId || appState.currentUser?.userId;
        if (!patientId) throw new Error("No se pudo identificar al paciente");

        const { ApiClinical, Api } = await import('../api.js');
        const now = new Date();
        const from = new Date(now.getFullYear() - 5, 0, 1);

        const encountersResp = await ApiClinical.get(`v1/Encounter?patientId=${patientId}&from=${from.toISOString()}&to=${now.toISOString()}`);
        const encounters = Array.isArray(encountersResp) ? encountersResp : encountersResp?.value || [];
        if (!encounters.length) return showEmpty(container, "No hay historial médico disponible");
        

        // Obtener información de doctores en paralelo
        const doctorIds = [...new Set(encounters.map(e => e.doctorId || e.DoctorId).filter(Boolean))];
        const doctorsMap = new Map(await Promise.all(
            doctorIds.map(async id => {
                try {
                    const d = await Api.get(`v1/Doctor/${id}`);
                    const fullName = d ? `Dr. ${d.firstName || d.FirstName || ''} ${d.lastName || d.LastName || ''}`.trim() : `Dr. ${id}`;
                    return [id, { fullName, specialty: d?.specialty || d?.Specialty || '' }];
                } catch { return [id, { fullName: `Dr. ${id}`, specialty: '' }]; }
            })
        ));

        // Renderizar
        renderHistoryCards(encounters, container, doctorsMap);

    } catch (err) {
        console.error(err);
        showEmpty(container, "No se pudo cargar el historial médico", "fas fa-exclamation-triangle");
    }
}

/** Renderizar cards */
function renderHistoryCards(encounters, container, doctorsMap) {
    const template = document.getElementById('history-card-template');
    container.innerHTML = '';

    encounters.forEach(enc => {
        const clone = template.content.cloneNode(true);

        // Fecha
        const date = new Date(enc.date || enc.Date);

        // Doctor
        const doctorId = enc.doctorId || enc.DoctorId;
        const doctorInfo = doctorsMap.get(doctorId) || { 
            fullName: 'Dr. Sin nombre', 
            specialty: '' 
        };

        // Motivo
        const reasons = enc.reasons || enc.Reasons || enc.reason || enc.Reason || 'Consulta general';

        // SOAP
        const subjective = enc.subjective || enc.Subjective || enc.subjetive || enc.Subjetive || '';
        const objective  = enc.objective  || enc.Objective  || enc.objetive  || enc.Objetive || '';
        const assessment = enc.assessment || enc.Assessment || '';
        const plan       = enc.plan       || enc.Plan       || '';

        // META DATA
        clone.querySelector('.history-date .meta-value').textContent = 
            `${date.toLocaleDateString()} - ${date.toLocaleTimeString()}`;

        clone.querySelector('.history-doctor .meta-value').textContent = doctorInfo.fullName;
        clone.querySelector('.history-doctor .meta-specialty').textContent = 
            doctorInfo.specialty ? `— ${doctorInfo.specialty}` : '';

        clone.querySelector('.history-reason .meta-value').textContent = reasons;

        // SOAP FIELDS
        clone.querySelector('.soap-subjective').textContent = subjective;
        clone.querySelector('.soap-objective').textContent  = objective;
        clone.querySelector('.soap-assessment').textContent = assessment;
        clone.querySelector('.soap-plan').textContent       = plan;

        // Descargar PDF
        clone.querySelector('.btn-history-details').onclick = () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const margin = 20;
        let y = 20;
        const lineHeight = 7;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // ENCABEZADO 
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(37, 99, 235); // azul institucional
        doc.text("CuidarMed+", margin, y);

        y += 14;

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(55, 65, 81);
        doc.text("Informe de Consulta Médica", margin, y);

        y += 10;

        // Línea divisoria sutil
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);

        y += 12;

        // INFORMACIÓN DEL MÉDICO Y CONSULTA 
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(45, 55, 72);

        doc.text("Médico:", margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(doctorInfo.fullName, margin + 35, y);
        y += lineHeight;

        if (doctorInfo.specialty) {
            doc.setFont("helvetica", "bold");
            doc.text("Especialidad:", margin, y);
            doc.setFont("helvetica", "normal");
            doc.text(doctorInfo.specialty, margin + 35, y);
            y += lineHeight;
        }

        doc.setFont("helvetica", "bold");
        doc.text("Fecha:", margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${date.toLocaleDateString()} ${date.toLocaleTimeString()}`, margin + 35, y);
        y += lineHeight;

        doc.setFont("helvetica", "bold");
        doc.text("Motivo:", margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(reasons || "No registrado", margin + 35, y);

        y += lineHeight + 8;

        // Línea divisoria
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 12;

        // UTILIDADES
        const sectionHeader = (title) => {
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(37, 99, 235); // azul institucional
            doc.text(title, margin, y);
            y += 8;

            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.line(margin, y, pageWidth - margin, y);

            y += 7;
            doc.setTextColor(45, 55, 72);
        };

        const writeText = (txt) => {
            const lines = doc.splitTextToSize(txt || "No registrado", pageWidth - margin * 2);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.text(lines, margin, y);

            y += lines.length * 6 + 8;
        };

        // SECCIONES SOAP
        sectionHeader("Subjetivo (S)");
        writeText(subjective);

        sectionHeader("Objetivo (O)");
        writeText(objective);

        sectionHeader("Evaluación (A)");
        writeText(assessment);

        sectionHeader("Plan (P)");
        writeText(plan);

        // FOOTER
        if (y > pageHeight - 20) {
            doc.addPage();
            y = 20;
        }

        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);

        const footerText = "CuidarMed+ — Sistema de Gestión Clínica";
        const footerWidth = doc.getTextWidth(footerText);
        doc.text(footerText, (pageWidth - footerWidth) / 2, pageHeight - 10);

        // GUARDAR PDF
        doc.save(`Consulta_${enc.encounterId || enc.EncounterId}.pdf`);
    };



        container.appendChild(clone);
    });
}
/** Helpers */
const showEmpty = (c,t,i="fas fa-file-medical") => c.innerHTML=`<div class="empty-state"><i class="${i}"></i><p>${t}</p></div>`;
const formatDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;