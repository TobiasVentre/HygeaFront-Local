import { registerUser } from "../apis/authms.js";
import { Api } from "../api.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerForm");
    if (!form) return;

    const button = document.getElementById("registerButton");
    const roleInput = document.getElementById("role");
    const roleCards = Array.from(document.querySelectorAll(".role-card"));


    const clientFieldsSection = document.getElementById("clientFields");
    const fumigatorFieldsSection = document.getElementById("fumigatorFields");

    const clientFieldInputs = [
        document.getElementById("clientBirthDate"),
        document.getElementById("clientDomicile"),
        document.getElementById("phone")
    ];

    const fumigatorRequiredInputs = [
        document.getElementById("fumigatorLicense"),
        document.getElementById("fumigatorSpecialty"),
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
        const isFumigator = selectedRole === "Fumigator";

        if (clientFieldsSection) {
            clientFieldsSection.classList.toggle("hidden", isFumigator);
        }

        if (fumigatorFieldsSection) {
            fumigatorFieldsSection.classList.toggle("hidden", !isFumigator);
        }

        setRequired(clientFieldInputs, !isFumigator);
        setRequired(fumigatorRequiredInputs, isFumigator);
    }

    function updateRoleCards(selectedRole) {
        roleCards.forEach((card) => {
            const isActive = card.dataset.role === selectedRole;
            card.classList.toggle("active", isActive);
            card.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function setRole(newRole) {
        const normalizedRole = newRole === "Fumigator" ? "Fumigator" : "Client";
        roleInput.value = normalizedRole;
        updateRoleCards(normalizedRole);
        updateRoleSections(normalizedRole);
    }

    roleCards.forEach((card) => {
        card.addEventListener("click", () => setRole(card.dataset.role));
    });

    setRole(roleInput.value || roleCards[0]?.dataset.role || "Client");
    
    // Submit del formulario

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const selectedRole = roleInput.value || "Client";
        const apiRole = selectedRole === "Fumigator" ? "fumigator" : "client";

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
        

        const clientExtras = {
            birthDate: document.getElementById("clientBirthDate")?.value || "",
            address: document.getElementById("clientDomicile")?.value.trim() || "",
 phone: document.getElementById("phone")?.value.trim() || "",
        };
        
        // Log para debugging
        console.log("=== DATOS CAPTURADOS DEL FORMULARIO ===");
        console.log("clientExtras completo:", JSON.stringify(clientExtras, null, 2));
        console.log("membershipNumber capturado:", clientExtras.membershipNumber);
        console.log("healthPlan capturado:", clientExtras.healthPlan);

        const fumigatorExtras = {
            licenseNumber: document.getElementById("fumigatorLicense")?.value.trim() || "",
            specialty: document.getElementById("fumigatorSpecialty")?.value.trim() || "",
            biography: document.getElementById("fumigatorBiography")?.value.trim() || "",
            phone: document.getElementById("phone")?.value.trim() || "",
        };

     
        // Log para debugging de especialidad
        console.log("=== FUMIGADOR EXTRAS ===");
        console.log("fumigatorExtras completo:", JSON.stringify(fumigatorExtras, null, 2));
        console.log("specialty capturado:", fumigatorExtras.specialty);
        console.log("specialty elemento:", document.getElementById("fumigatorSpecialty")?.value);
        
        // =====================================================
        // CONSTRUIR EL PAYLOAD PARA AuthMS
        // =====================================================
        const payload = {
            firstName,
            lastName,
            email,
            dni,
            password,
            role: apiRole,
        };

        if (selectedRole === "Client") {
            payload.dateOfBirth = clientExtras.birthDate || null;
            payload.address = clientExtras.address || null;
            payload.healthPlan = clientExtras.healthPlan || null;
            payload.membershipNumber = clientExtras.membershipNumber || null;
            payload.phone = clientExtras.phone || null;
        }

        if (selectedRole === "Fumigator") {
            payload.licenseNumber = fumigatorExtras.licenseNumber || null;
            payload.specialty = fumigatorExtras.specialty || null;
            payload.biography = fumigatorExtras.biography || null;
            payload.phone = fumigatorExtras.phone || null;
        }

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando cuenta...';

        try {
            // Log para debugging
            console.log("=== DATOS DEL REGISTRO ===");
            console.log("Fecha de nacimiento:", clientExtras.birthDate);
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