// ============================================
// MÓDULO DE PRESCRIPCIONES - CLIENTE (CORREGIDO)
// ============================================

import { ApiClinical, Api } from '../api.js';
import { showNotification } from './client-notifications.js';

/**
 * Muestra la receta asociada a un encounter
 * @param {number} encounterId
 */
export async function viewPrescription(encounterId) {
    console.log('🔍 Cargando receta para encounter:', encounterId);
    
    try {
        const modal = document.getElementById('prescription-modal');
        const content = document.getElementById('prescription-content');
        
        if (!modal || !content) {
            console.error('❌ Modal o contenedor no encontrado');
            showNotification('Error: Modal no encontrado', 'error');
            return;
        }

        // Mostrar loading
        content.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando receta...</p>
            </div>
        `;
        
        // Mostrar modal
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // Llamada al endpoint
        console.log('📡 Llamando a API: v1/Prescription/encounter/' + encounterId);
        const response = await ApiClinical.get(`v1/Prescription/encounter/${encounterId}`);

        console.log('📥 Respuesta cruda:', response);

        if (!Array.isArray(response) || response.length === 0) {
            throw new Error('No se encontró ninguna receta para este encuentro');
        }

        // Tomamos la PRIMER receta del array
        const prescription = response[0];
        console.log('✅ Receta seleccionada:', prescription);

        // Preparar datos según la estructura real de la BD
        const prescriptionData = {
            prescriptionId: prescription.prescriptionId,
            encounterId: prescription.encounterId,
            clientId: prescription.clientId,
            fumigatorId: prescription.fumigatorId,
            diagnosis: prescription.diagnosis || 'No especificado',
            medication: prescription.medication || 'No especificado',
            dosage: prescription.dosage || 'No especificada',
            frequency: prescription.frequency || 'No especificada',
            duration: prescription.duration || 'No especificada',
            additionalInstructions: prescription.additionalInstructions || 'Sin instrucciones adicionales',
            prescriptionDate: prescription.prescriptionDate || prescription.createdAt
        };

        // Obtener información del fumigator
        let fumigatorName = 'Dr. Desconocido';
        let fumigatorSpecialty = '';
        let fumigatorMatricula = "";
        
        if (prescriptionData.fumigatorId) {
            try {
                console.log('👨‍⚕️ Cargando información del fumigator:', prescriptionData.fumigatorId);
                const fumigator = await Api.get(`v1/technician/${prescriptionData.fumigatorId}`);
                const firstName = fumigator.FirstName || fumigator.firstName || '';
                const lastName = fumigator.LastName || fumigator.lastName || '';
                fumigatorName = `Dr. ${firstName} ${lastName}`.trim();
                fumigatorSpecialty = fumigator.Specialty || fumigator.specialty || '';
                fumigatorMatricula = fumigator.LicenseNumber || fumigator.licenseNumber || '';
                console.log('✅ Fumigator encontrado:', fumigatorName);
            } catch (err) {
                console.warn('⚠️ No se pudo cargar info del fumigator:', err);
            }
        }

        // Formatear fecha
        const date = new Date(prescriptionData.prescriptionDate);
        const dateStr = date.toLocaleDateString('es-AR', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        prescriptionData.fumigatorMatricula = fumigatorMatricula;
        // Renderizar contenido
        content.innerHTML = `
            <div class="prescription-container">
                <div class="prescription-header">
                    <div class="prescription-logo">
                        <i class="fas fa-heart"></i>
                        <span>Hygea</span>
                    </div>
                    <div class="prescription-info">
                        <h4>${fumigatorName}</h4>
                        ${fumigatorSpecialty ? `<p class="prescription-specialty">${fumigatorSpecialty}</p>` : ''}

                        <p class="prescription-date">Fecha: ${dateStr}</p>
                    </div>
                </div>

                <div class="prescription-divider"></div>

                <div class="prescription-section">
                    <h5><i class="fas fa-stethoscope"></i> Diagnóstico</h5>
                    <p>${prescriptionData.diagnosis}</p>
                </div>

                <div class="prescription-section">
                    <h5><i class="fas fa-prescription"></i> Medicamento</h5>
                    <p>${prescriptionData.medication}</p>
                </div>
                
                <div class="prescription-section">
                    <h5><i class="fas fa-pills"></i> Dosis</h5>
                    <p>${prescriptionData.dosage}</p>
                </div>
                
                <div class="prescription-section">
                    <h5><i class="fas fa-clock"></i> Frecuencia</h5>
                    <p>${prescriptionData.frequency}</p>
                </div>
                
                <div class="prescription-section">
                    <h5><i class="fas fa-calendar-days"></i> Duración</h5>
                    <p>${prescriptionData.duration}</p>
                </div>
                
                <div class="prescription-section">
                    <h5><i class="fas fa-comment-medical"></i> Instrucciones Adicionales</h5>
                    <p>${prescriptionData.additionalInstructions}</p>
                </div>

                <div class="prescription-footer">
                    <p class="prescription-signature">
                        <strong>${fumigatorName}</strong><br>
                        Matrícula Profesional: ${prescriptionData.fumigatorMatricula || 'No disponible'}
                    </p>
                </div>
            </div>
        `;

        // Guardar datos para PDF (incluir nombre del fumigator)
        prescriptionData.fumigatorName = fumigatorName;
        prescriptionData.fumigatorSpecialty = fumigatorSpecialty;
        prescriptionData.fumigatorMatricula = fumigatorMatricula;
        modal.setAttribute('data-prescription', JSON.stringify(prescriptionData));
        
        setTimeout(() => {
            attachModalEventListeners();
        }, 100);
        
        console.log('✅ Receta renderizada exitosamente');
        showNotification('Receta cargada correctamente', 'success');

    } catch (error) {
        console.error('❌ Error al cargar receta:', error);
        
        const content = document.getElementById('prescription-content');
        if (content) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>No se pudo cargar la receta</p>
                    <small>${error.message || 'Error desconocido'}</small>
                    <br><br>
                    <button class="btn btn-secondary" onclick="window.closePrescription()">
                        Cerrar
                    </button>
                </div>
            `;
        }
        
        showNotification('No se pudo cargar la receta', 'error');
    }
}

/**
 * Cierra el modal de prescripción
 */
export function closePrescription() {
    console.log('🚪 Cerrando modal de prescripción');
    
    const modal = document.getElementById('prescription-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        
        // Limpiar contenido
        const content = document.getElementById('prescription-content');
        if (content) {
            content.innerHTML = '';
        }
        
        // Limpiar datos guardados
        modal.removeAttribute('data-prescription');
    }
}

/**
 * Descarga la receta como PDF
 */
export function downloadPrescriptionPDF() {
    console.log('📥 Iniciando descarga de PDF...');

    try {
        const modal = document.getElementById('prescription-modal');
        const prescriptionDataStr = modal?.getAttribute('data-prescription');

        if (!prescriptionDataStr) {
            throw new Error('No hay datos de prescripción disponibles');
        }

        const prescriptionData = JSON.parse(prescriptionDataStr);

        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF no está cargado');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const margin = 20;
        let y = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // ================================
        //   HEADER Hygea
        // ================================
        doc.setFont(undefined, 'bold');
        doc.setFontSize(24);
        doc.setTextColor(37, 99, 235);
        doc.text('Hygea', margin, y);

        y += 8;

        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.8);
        doc.line(margin, y, pageWidth - margin, y);

        y += 12;

        // SUBTÍTULO
        doc.setFontSize(16);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(75, 85, 99);
        doc.text('Receta Médica', margin, y);

        y += 15;

        // ================================
        //   INFORMACIÓN DEL MÉDICO
        // ================================
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text(prescriptionData.fumigatorName || 'Dr. Desconocido', margin, y);

        y += 6;

        if (prescriptionData.fumigatorSpecialty) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(107, 114, 128);
            doc.text(prescriptionData.fumigatorSpecialty, margin, y);
            y += 6;
        }

        const date = new Date(prescriptionData.prescriptionDate);

        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text(
            'Fecha: ' + date.toLocaleDateString('es-AR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            margin,
            y
        );

        y += 12;

        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.6);
        doc.line(margin, y, pageWidth - margin, y);

        y += 12;

        // ================================
        //   FUNCIÓN PARA SECCIONES
        // ================================
        const addSection = (title, content) => {
            if (!content) return;

            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(31, 41, 55);
            doc.text(title, margin, y);

            y += 7;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(55, 65, 81);

            const lines = doc.splitTextToSize(content, pageWidth - 2 * margin);
            doc.text(lines, margin, y);

            y += lines.length * 6 + 10;
        };

        // ================================
        //   SECCIONES DE CONTENIDO
        // ================================
        addSection('Diagnóstico', prescriptionData.diagnosis);
        addSection('Medicación', prescriptionData.medication);
        addSection('Dosis', prescriptionData.dosage);
        addSection('Frecuencia', prescriptionData.frequency);
        addSection('Duración', prescriptionData.duration);
        addSection('Instrucciones Adicionales', prescriptionData.additionalInstructions);

        // ================================
        //   FIRMA
        // ================================
        if (y > pageHeight - 35) {
            doc.addPage();
            y = 20;
        }

        doc.setDrawColor(156, 163, 175);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + 70, y);

        y += 8;

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text(prescriptionData.fumigatorName || 'Dr. Desconocido', margin, y);

        y += 5;

        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(107, 114, 128);

        const licenseText = prescriptionData.fumigatorMatricula
            ? `Matrícula Profesional: ${prescriptionData.fumigatorMatricula}`
            : "Matrícula Profesional";

        doc.text(licenseText, margin, y);


        // ================================
        //   FOOTER
        // ================================
        const footerY = pageHeight - 15;

        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(156, 163, 175);

        const footerText =
            'Hygea - Sistema de Gestión Médica | Documento generado el ' +
            new Date().toLocaleDateString('es-AR');

        const footerWidth = doc.getTextWidth(footerText);
        doc.text(footerText, (pageWidth - footerWidth) / 2, footerY);

        // ================================
        //   GUARDAR
        // ================================
        const fileName = `Receta_${date.toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);

        console.log('✅ PDF descargado:', fileName);
        showNotification('Receta descargada exitosamente', 'success');

    } catch (error) {
        console.error('❌ Error al descargar PDF:', error);
        showNotification('Error al descargar la receta: ' + error.message, 'error');
    }
}


/**
 * ✅ NUEVA FUNCIÓN: Vincula event listeners al modal
 * Se llama cada vez que se abre el modal
 */
function attachModalEventListeners() {
    console.log('🔧 Vinculando event listeners del modal...');
    
    const modal = document.getElementById('prescription-modal');
    if (!modal) return;

    // Botón Cerrar (X en header)
    const closeButtons = modal.querySelectorAll('.close-modal');
    closeButtons.forEach(btn => {
        // Remover listeners previos clonando el botón
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 Click en X');
            closePrescription();
        });
    });

    // Botón Cerrar (footer)
    const closeBtn = document.getElementById('close-prescription');
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        
        newCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 Click en Cerrar');
            closePrescription();
        });
        console.log('✅ Botón Cerrar vinculado');
    }

    // ✅ Botón Descargar PDF
    const downloadBtn = document.getElementById('download-prescription');
    if (downloadBtn) {
        const newDownloadBtn = downloadBtn.cloneNode(true);
        downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
        
        newDownloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 Click en Descargar PDF');
            downloadPrescriptionPDF();
        });
        console.log('✅ Botón Descargar vinculado');
    } else {
        console.warn('⚠️ Botón download-prescription no encontrado');
    }

    // Click fuera del modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closePrescription();
        }
    });
    
    console.log('✅ Event listeners vinculados correctamente');
}

/**
 * Inicializa el modal de prescripciones (solo al cargar la página)
 */
export function initializePrescriptionModal() {
    console.log('🔧 Inicializando modal de prescripciones...');
    
    const modal = document.getElementById('prescription-modal');
    if (!modal) {
        console.warn('⚠️ Modal de prescripción no encontrado en el DOM');
        return;
    }

    // Evento ESC para cerrar
    const escHandler = (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closePrescription();
        }
    };
    
    document.removeEventListener('keydown', escHandler);
    document.addEventListener('keydown', escHandler);

    console.log('✅ Modal de prescripciones inicializado');
}

// Exportar a window para uso global
window.viewPrescription = viewPrescription;
window.closePrescription = closePrescription;
window.downloadPrescriptionPDF = downloadPrescriptionPDF;