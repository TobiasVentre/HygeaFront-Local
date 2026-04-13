import { confirmPasswordReset, requestPasswordReset } from "./apis/authms.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("blanqueoForm");
    const emailInput = document.getElementById("email");
    const resetCodeInput = document.getElementById("resetCode");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const submitButton = document.getElementById("blanqueoButton");
    const confirmFields = document.getElementById("resetConfirmFields");
    const feedback = document.getElementById("resetFeedback");

    let requestCompleted = false;

    const emailFromUrl = new URLSearchParams(window.location.search).get("email");
    if (emailFromUrl) {
        emailInput.value = decodeURIComponent(emailFromUrl);
    }

    function showFeedback(message, type = "info") {
        feedback.textContent = message;
        feedback.className = `confirm-feedback ${type}`;
        feedback.style.display = "block";
    }

    function setLoading(loading, text) {
        submitButton.disabled = loading;
        submitButton.innerHTML = loading
            ? `<i class="fas fa-spinner fa-spin"></i> ${text}`
            : requestCompleted
                ? '<i class="fas fa-check-circle"></i> Restablecer contrasena'
                : '<i class="fas fa-paper-plane"></i> Enviar Instrucciones';
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim();
        if (!email) {
            showFeedback("Ingresa un email valido.", "error");
            return;
        }

        if (!requestCompleted) {
            setLoading(true, "Enviando codigo...");
            try {
                await requestPasswordReset(email);
                requestCompleted = true;
                confirmFields.style.display = "block";
                showFeedback("Te enviamos un codigo de restablecimiento. Ingresalo junto con tu nueva contrasena.", "success");
                setLoading(false);
                resetCodeInput?.focus();
            } catch (error) {
                showFeedback(error.message || "No se pudo enviar el codigo.", "error");
                setLoading(false);
            }
            return;
        }

        const resetCode = resetCodeInput.value.trim();
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (resetCode.length !== 6) {
            showFeedback("El codigo debe tener 6 caracteres.", "error");
            return;
        }

        if (newPassword.length < 8) {
            showFeedback("La nueva contrasena debe tener al menos 8 caracteres.", "error");
            return;
        }

        if (newPassword !== confirmPassword) {
            showFeedback("La confirmacion de contrasena no coincide.", "error");
            return;
        }

        setLoading(true, "Restableciendo...");
        try {
            await confirmPasswordReset(email, resetCode, newPassword);
            showFeedback("Contrasena restablecida correctamente. Redirigiendo al login...", "success");
            setTimeout(() => {
                window.location.href = "login.html";
            }, 1800);
        } catch (error) {
            showFeedback(error.message || "No se pudo restablecer la contrasena.", "error");
            setLoading(false);
        }
    });
});

