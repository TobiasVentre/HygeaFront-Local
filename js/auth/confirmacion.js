import { verifyEmail, resendVerificationEmail } from "../apis/authms.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("confirmForm");
    const emailInput = document.getElementById("email");
    const codeInput = document.getElementById("verificationCode");
    const confirmButton = document.getElementById("confirmButton");
    const resendButton = document.getElementById("resendButton");
    const feedback = document.getElementById("confirmFeedback");

    // Obtener el email de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const emailFromUrl = urlParams.get("email");
    
    if (emailFromUrl) {
        emailInput.value = decodeURIComponent(emailFromUrl);
    } else {
        // Si no hay email en la URL, redirigir al registro
        alert("No se encontró el email. Por favor, regístrate nuevamente.");
        window.location.href = "registro.html";
        return;
    }

    // Solo permitir letras y números en el código (sin espacios ni caracteres especiales)
    codeInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    });

    function showFeedback(message, type = "info") {
        feedback.textContent = message;
        feedback.className = `confirm-feedback ${type}`;
        feedback.style.display = "block";
        
        if (type === "success") {
            setTimeout(() => {
                feedback.style.display = "none";
            }, 3000);
        }
    }

    function hideFeedback() {
        feedback.style.display = "none";
    }

    // Confirmar código
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideFeedback();

        const email = emailInput.value.trim();
        const code = codeInput.value.trim();

        if (!email) {
            showFeedback("El email es requerido", "error");
            return;
        }

        if (code.length !== 6) {
            showFeedback("El código debe tener 6 caracteres", "error");
            return;
        }

        confirmButton.disabled = true;
        confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

        try {
            await verifyEmail(email, code);
            showFeedback("¡Cuenta confirmada exitosamente! Redirigiendo...", "success");
            
            setTimeout(() => {
                window.location.href = "login.html";
            }, 2000);
        } catch (err) {
            console.error("Error al verificar código:", err);
            showFeedback(err.message || "El código no es válido o ha expirado", "error");
            codeInput.value = "";
            codeInput.focus();
        } finally {
            confirmButton.disabled = false;
            confirmButton.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar cuenta';
        }
    });

    // Reenviar código
    resendButton.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        
        if (!email) {
            showFeedback("El email es requerido", "error");
            return;
        }

        resendButton.disabled = true;
        resendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            await resendVerificationEmail(email);
            showFeedback("Código reenviado. Revisa tu correo electrónico.", "success");
        } catch (err) {
            console.error("Error al reenviar código:", err);
            showFeedback(err.message || "Error al reenviar el código", "error");
        } finally {
            resendButton.disabled = false;
            resendButton.innerHTML = '<i class="fas fa-redo"></i> Reenviar código';
        }
    });
});

