import { registerUser } from "../apis/authms.js";
import { Api } from "../api.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerForm");
    if (!form) return;

    const button = document.getElementById("registerButton");
    const roleInput = document.getElementById("role");
    const roleCards = Array.from(document.querySelectorAll(".role-card"));


    const clientFieldsSection = document.getElementById("clientFields");
    const technicianFieldsSection = document.getElementById("technicianFields");

    const clientFieldInputs = [
        document.getElementById("clientBirthDate"),
        document.getElementById("clientDomicile"),
        document.getElementById("phone")
    ];

    const technicianRequiredInputs = [
        document.getElementById("technicianSpecialty"),
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
        const isTechnician = selectedRole === "Technician";

        if (clientFieldsSection) {
            clientFieldsSection.classList.toggle("hidden", isTechnician);
        }

        if (technicianFieldsSection) {
            technicianFieldsSection.classList.toggle("hidden", !isTechnician);
        }

        if (!isTechnician) {
            const specialtyInput = document.getElementById("technicianSpecialty");
            if (specialtyInput) specialtyInput.value = "";
        }

        setRequired(clientFieldInputs, !isTechnician);
        setRequired(technicianRequiredInputs, isTechnician);
    }

    function updateRoleCards(selectedRole) {
        roleCards.forEach((card) => {
            const isActive = card.dataset.role === selectedRole;
            card.classList.toggle("active", isActive);
            card.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function setRole(newRole) {
        const normalizedRole = newRole === "Technician" ? "Technician" : "Client";
        roleInput.value = normalizedRole;
        updateRoleCards(normalizedRole);
        updateRoleSections(normalizedRole);
    }

    roleCards.forEach((card) => {
        card.addEventListener("click", () => setRole(card.dataset.role));
    });

    setRole(roleInput.value || roleCards[0]?.dataset.role || "Client");

    // --- Validación de fuerza de contraseña ---
    const passwordField = document.getElementById("password");
    const strengthContainer = document.getElementById("passwordStrength");
    const strengthBar = strengthContainer?.querySelector(".strength-bar");
    const strengthText = document.getElementById("strengthText");
    const passwordErrorEl = document.getElementById("passwordError");

    const PASSWORD_RULES = [
        { key: "length",    label: "Al menos 8 caracteres",         test: (p) => p.length >= 8 },
        { key: "uppercase", label: "Una letra mayúscula",            test: (p) => /[A-Z]/.test(p) },
        { key: "lowercase", label: "Una letra minúscula",            test: (p) => /[a-z]/.test(p) },
        { key: "number",    label: "Un número",                      test: (p) => /[0-9]/.test(p) },
        { key: "special",   label: "Un carácter especial (!@#$...)", test: (p) => /[^A-Za-z0-9]/.test(p) },
    ];

    const reqList = document.createElement("ul");
    reqList.className = "password-req-list";
    PASSWORD_RULES.forEach(({ key, label }) => {
        const li = document.createElement("li");
        li.id = `pwd-req-${key}`;
        li.innerHTML = `<i class="fas fa-times-circle pwd-req-icon"></i><span>${label}</span>`;
        reqList.appendChild(li);
    });
    strengthContainer?.insertAdjacentElement("afterend", reqList);

    function refreshStrengthUI(password) {
        const met = PASSWORD_RULES.map(({ test }) => test(password));
        const score = met.filter(Boolean).length;
        const hasInput = password.length > 0;

        if (strengthBar) strengthBar.style.display = hasInput ? "block" : "none";
        reqList.style.display = hasInput ? "block" : "none";

        PASSWORD_RULES.forEach(({ key }, i) => {
            const li = document.getElementById(`pwd-req-${key}`);
            const icon = li?.querySelector(".pwd-req-icon");
            li?.classList.toggle("pwd-req--met", met[i]);
            if (icon) icon.className = met[i]
                ? "fas fa-check-circle pwd-req-icon"
                : "fas fa-times-circle pwd-req-icon";
        });

        const LEVELS = ["strength-weak", "strength-medium", "strength-strong", "strength-very-strong"];
        const LABELS = ["Muy débil", "Regular", "Fuerte", "Muy fuerte"];
        const idx = !hasInput ? -1 : score <= 2 ? 0 : score === 3 ? 1 : score === 4 ? 2 : 3;

        strengthContainer?.classList.remove(...LEVELS);
        if (idx >= 0) strengthContainer?.classList.add(LEVELS[idx]);
        if (strengthText) strengthText.textContent = hasInput ? LABELS[idx] : "Ingresa una contraseña";
    }

    function isPasswordValid(password) {
        return PASSWORD_RULES.every(({ test }) => test(password));
    }

    passwordField?.addEventListener("input", () => refreshStrengthUI(passwordField.value));
    // --- Fin validación de contraseña ---

    // Submit del formulario

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const selectedRole = roleInput.value || "Client";
        const apiRole = selectedRole === "Technician" ? "technician" : "client";

        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            alert("Las contraseñas no coinciden.");
            return;
        }

        if (!isPasswordValid(password)) {
            if (passwordErrorEl) passwordErrorEl.textContent = "La contraseña debe incluir mayúscula, minúscula, número y carácter especial.";
            return;
        }
        if (passwordErrorEl) passwordErrorEl.textContent = "";
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

        const technicianExtras = {
            specialty: document.getElementById("technicianSpecialty")?.value.trim() || "",
            biography: document.getElementById("technicianBiography")?.value.trim() || "",
            phone: document.getElementById("phone")?.value.trim() || "",
        };

     
        // Log para debugging de especialidad
        console.log("=== TÉCNICO EXTRAS ===");
        console.log("technicianExtras completo:", JSON.stringify(technicianExtras, null, 2));
        console.log("specialty capturado:", technicianExtras.specialty);
        console.log("specialty elemento:", document.getElementById("technicianSpecialty")?.value);
        
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

        if (selectedRole === "Technician") {
            payload.specialty = technicianExtras.specialty || null;
            payload.biography = technicianExtras.biography || null;
            payload.phone = technicianExtras.phone || null;
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
