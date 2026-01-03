import { registerUser } from "../apis/authms.js";
import { Api } from "../api.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerForm");
    if (!form) return;

    const button = document.getElementById("registerButton");
    const roleInput = document.getElementById("role");
    const roleCards = Array.from(document.querySelectorAll(".role-card"));


    const patientFieldsSection = document.getElementById("patientFields");
    const doctorFieldsSection = document.getElementById("doctorFields");

    const patientFieldInputs = [
        document.getElementById("patientBirthDate"),
        document.getElementById("patientDomicile"),
        document.getElementById("patientHealthPlan"),
        document.getElementById("patientMembershipNumber"),
        document.getElementById("phone")
    ];

    const doctorRequiredInputs = [
        document.getElementById("doctorLicense"),
        document.getElementById("doctorSpecialty"),
        document.getElementById("phone")
    ];

    function setRequired(inputs, enabled) {
        inputs.filter(Boolean).forEach((input) => {
            if (enabled) {
                input.setAttribute("required", "true");
            } else {
                input.removeAttribute("required");
            }
        });
    }

    function updateRoleSections(selectedRole) {
        const isDoctor = selectedRole === "Doctor";

        if (patientFieldsSection) {
            patientFieldsSection.classList.toggle("hidden", isDoctor);
        }

        if (doctorFieldsSection) {
            doctorFieldsSection.classList.toggle("hidden", !isDoctor);
        }

        setRequired(patientFieldInputs, !isDoctor);
        setRequired(doctorRequiredInputs, isDoctor);
    }

    function updateRoleCards(selectedRole) {
        roleCards.forEach((card) => {
            const isActive = card.dataset.role === selectedRole;
            card.classList.toggle("active", isActive);
            card.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function setRole(newRole) {
        const normalizedRole = newRole === "Doctor" ? "Doctor" : "Patient";
        roleInput.value = normalizedRole;
        updateRoleCards(normalizedRole);
        updateRoleSections(normalizedRole);
    }

    roleCards.forEach((card) => {
        card.addEventListener("click", () => setRole(card.dataset.role));
    });

    setRole(roleInput.value || roleCards[0]?.dataset.role || "Patient");
    
    // Submit del formulario

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const selectedRole = roleInput.value || "Patient";

        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            alert("Las contraseñas no coinciden.");
            return;
        }
        const firstName = document.getElementById("firstName").value.trim();
        const lastName = document.getElementById("lastName").value.trim();
        const email = document.getElementById("email").value.trim();
        const dni = document.getElementById("dni").value.trim();
        

        const patientExtras = {
            birthDate: document.getElementById("patientBirthDate")?.value || "",
            address: document.getElementById("patientDomicile")?.value.trim() || "",
            healthPlan: document.getElementById("patientHealthPlan")?.value.trim() || "",
            membershipNumber: document.getElementById("patientMembershipNumber")?.value.trim() || "",
            phone: document.getElementById("phone")?.value.trim() || "",
        };
        
        // Log para debugging
        console.log("=== DATOS CAPTURADOS DEL FORMULARIO ===");
        console.log("patientExtras completo:", JSON.stringify(patientExtras, null, 2));
        console.log("membershipNumber capturado:", patientExtras.membershipNumber);
        console.log("membershipNumber elemento:", document.getElementById("patientMembershipNumber")?.value);
        console.log("healthPlan capturado:", patientExtras.healthPlan);

        const doctorExtras = {
            licenseNumber: document.getElementById("doctorLicense")?.value.trim() || "",
            specialty: document.getElementById("doctorSpecialty")?.value.trim() || "",
            biography: document.getElementById("doctorBiography")?.value.trim() || "",
            phone: document.getElementById("phone")?.value.trim() || "",
        };

     
        // Log para debugging de especialidad
        console.log("=== DOCTOR EXTRAS ===");
        console.log("doctorExtras completo:", JSON.stringify(doctorExtras, null, 2));
        console.log("specialty capturado:", doctorExtras.specialty);
        console.log("specialty elemento:", document.getElementById("doctorSpecialty")?.value);
        
        // =====================================================
        // CONSTRUIR EL PAYLOAD PARA AuthMS
        // =====================================================
        const payload = {
            firstName,
            lastName,
            email,
            dni,
            password,
            role: selectedRole,
        };

        if (selectedRole === "Patient") {
            payload.dateOfBirth = patientExtras.birthDate || null;
            payload.adress = patientExtras.address || null;
            payload.healthPlan = patientExtras.healthPlan || null;
            payload.membershipNumber = patientExtras.membershipNumber || null;
            payload.phone = patientExtras.phone || null;
        }

        if (selectedRole === "Doctor") {
            payload.licenseNumber = doctorExtras.licenseNumber || null;
            payload.specialty = doctorExtras.specialty || null;
            payload.biography = doctorExtras.biography || null;
            payload.phone = doctorExtras.phone || null;
        }

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando cuenta...';

        try {
            // Log para debugging
            console.log("=== DATOS DEL REGISTRO ===");
            console.log("Fecha de nacimiento:", patientExtras.birthDate);
            console.log("Role:", selectedRole);
        // =====================================================
        // ENVIAR DATOS A AuthMS
        // ===================================================== 
            console.log("Payload enviado a AuthMS:", payload);

            const response = await registerUser(payload);
            console.log("Respuesta de AuthMS:", response);

            // Redirigir a la página de confirmación con el email
            const email = encodeURIComponent(payload.email);
            window.location.href = `confirmacion.html?email=${email}`;
        } catch (err) {
            console.error("Error al registrar usuario:", err);

            let errorMessage = err.message || "Error desconocido al crear la cuenta.";

            // Limpiar y formatear el mensaje de error
            // Remover información técnica innecesaria
            errorMessage = errorMessage
                .replace(/^Error:\s*/i, '')
                .replace(/^Error\s+/i, '')
                .trim();

            // Mostrar solo el mensaje de error específico
            alert(`Error al crear la cuenta:\n\n${errorMessage}`);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-user-plus"></i> Crear Cuenta';
        }
    });
});