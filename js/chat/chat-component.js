// COMPONENTE DE CHAT - CuidarMed+
import { getChatMessages, markMessagesAsRead,CHAT_HUB_URL } from "./chat-service.js";


const SIGNALR_URL = "http://localhost:8085/chathub";

export class ChatComponent {
  constructor(config) {
    this.chatRoomId = config.chatRoomId;
    this.currentUserId = config.currentUserId;
    this.currentUserName = config.currentUserName;
    this.otherUserName = config.otherUserName;
    this.token = config.token;
    this.theme = config.theme || "doctor"; // 'doctor' o 'patient'
    this.container = config.container;
    this.config = config;

    // ✅ Validar que los IDs existan
    console.log("🔧 ChatComponent config:", {
      chatRoomId: this.chatRoomId,
      currentUserId: this.currentUserId,
      currentUserName: this.currentUserName,
      otherUserName: this.otherUserName,
    });

    if (!this.chatRoomId || !this.currentUserId) {
      console.error("❌ Faltan IDs requeridos:", {
        chatRoomId: this.chatRoomId,
        currentUserId: this.currentUserId,
      });
      this.container.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                    <p>Error: No se pudo inicializar el chat</p>
                    <p style="font-size: 0.875rem; color: #6b7280;">Faltan datos necesarios</p>
                </div>
            `;
      return;
    }

    this.connection = null;
    this.messages = [];
    this.isTyping = false;
    this.typingTimeout = null;

    this.init();
  }

  // Inicializa el componente
  async init() {
    this.render();
    await this.setupSignalR();
    await this.loadMessages();
    this.attachEventListeners();
  }

  //Renderiza la UI del chat
  render() {
    const themeColors =
      this.theme === "doctor"
        ? { primary: "#10b981", secondary: "#f0fdf4", accent: "#059669" }
        : { primary: "#3b82f6", secondary: "#eff6ff", accent: "#2563eb" };

    this.container.innerHTML = `
            <div class="chat-container" style="
                display: flex;
                flex-direction: column;
                height: 100%;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                overflow: hidden;
            ">
                <!-- Header -->
                <div class="chat-header" style="
                    background: linear-gradient(135deg, ${
                        themeColors.primary
                    } 0%, ${themeColors.accent} 100%);
                    color: white;
                    padding: 1rem 1.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                ">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="
                            width: 40px;
                            height: 40px;
                            border-radius: 50%;
                            background: white;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: ${themeColors.primary};
                            font-weight: bold;
                        ">
                            ${this.otherUserName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1rem; font-weight: 600;">
                                ${this.otherUserName}
                            </h3>
                            <p id="chat-status" style="
                                margin: 0;
                                font-size: 0.75rem;
                                opacity: 0.9;
                            ">
                                <i class="fas fa-circle" style="font-size: 0.5rem;"></i> En línea
                            </p>
                        </div>
                    </div>
                    <!-- ✅ Botones: Minimizar y Cerrar (SIN eventos inline) -->
                    <div style="display: flex; gap: 0.5rem;">
                        <button id="chat-minimize-btn" style="
                            background: rgba(255,255,255,0.2);
                            border: none;
                            color: white;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: background 0.2s;
                        " 
                        title="Minimizar">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button id="chat-close-btn" style="
                            background: rgba(255,255,255,0.2);
                            border: none;
                            color: white;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: background 0.2s;
                        " 
                        title="Cerrar">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <!-- Typing indicator -->
                <div id="typing-indicator" style="
                    display: none;
                    padding: 0.5rem 1.5rem;
                    background: ${themeColors.secondary};
                    font-size: 0.875rem;
                    color: #6b7280;
                    font-style: italic;
                ">
                    <i class="fas fa-ellipsis-h fa-fade"></i> ${
                        this.otherUserName
                    } está escribiendo...
                </div>

                <!-- Messages area -->
                <div id="chat-messages" style="
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.5rem;
                    background: white;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                ">
                    <!-- Los mensajes se cargarán aquí -->
                </div>

                <!-- Input area -->
                <div class="chat-input-area" style="
                    padding: 1rem 1.5rem;
                    background: #f9fafb;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    gap: 0.75rem;
                    align-items: flex-end;
                ">
                    <textarea 
                        id="chat-message-input" 
                        placeholder="Escribe un mensaje..."
                        rows="1"
                        style="
                            flex: 1;
                            padding: 0.75rem 1rem;
                            border: 1px solid #d1d5db;
                            border-radius: 24px;
                            resize: none;
                            font-family: inherit;
                            font-size: 0.875rem;
                            max-height: 120px;
                            outline: none;
                            transition: border-color 0.2s;
                        "
                        onfocus="this.style.borderColor='${
                            themeColors.primary
                        }'"
                        onblur="this.style.borderColor='#d1d5db'"
                    ></textarea>
                    <button id="chat-send-btn" style="
                        background: ${themeColors.primary};
                        color: white;
                        border: none;
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    ">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
    }

  //Configura SignalR
async setupSignalR() {
    try {
        console.log("🔌 [SignalR] Iniciando configuración...");
        console.log("🔌 [SignalR] Hub URL:", CHAT_HUB_URL);
        console.log("🔌 [SignalR] Chat Room ID:", this.chatRoomId);
        console.log("🔌 [SignalR] Current User ID:", this.currentUserId);

        // 1️⃣ Crear la conexión
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(CHAT_HUB_URL, {
                skipNegotiation: false,
                transport: signalR.HttpTransportType.WebSockets | 
                          signalR.HttpTransportType.ServerSentEvents | 
                          signalR.HttpTransportType.LongPolling
            })
            .withAutomaticReconnect([0, 2000, 5000, 10000]) // Reintentos automáticos
            .configureLogging(signalR.LogLevel.Information)
            .build();

        // 2️⃣ Configurar listeners ANTES de conectar
        this.connection.on("ReceiveMessage", (message) => {
            console.log("📨 [SignalR] Mensaje recibido:", message);
            this.addMessageToUI(message);
        });

        this.connection.on("JoinedChatRoom", (chatRoomId) => {
            console.log("✅ [SignalR] Confirmación de unión a sala:", chatRoomId);
            this.updateConnectionStatus("Conectado", "#10b981");
        });

        this.connection.on("Error", (errorMessage) => {
            console.error("❌ [SignalR] Error del servidor:", errorMessage);
            if (typeof this.showErrorMessage === 'function') {
                this.showErrorMessage(errorMessage);
            }
        });

        this.connection.on("UserTyping", (data) => {
            console.log("✍️ [SignalR] Usuario escribiendo:", data);
            if (typeof this.showTypingIndicator === 'function') {
                this.showTypingIndicator(data.userName || data.UserName);
            }
        });

        this.connection.on("UserStoppedTyping", (userId) => {
            console.log("✋ [SignalR] Usuario dejó de escribir:", userId);
            if (typeof this.hideTypingIndicator === 'function') {
                this.hideTypingIndicator();
            }
        });

        // 3️⃣ Eventos de conexión
        this.connection.onreconnecting((error) => {
            console.warn("🔄 [SignalR] Reconectando...", error);
            this.updateConnectionStatus("Reconectando...", "#f59e0b");
        });

        this.connection.onreconnected(async (connectionId) => {
            console.log("✅ [SignalR] Reconectado con ID:", connectionId);
            this.updateConnectionStatus("Conectado", "#10b981");
            
            // Re-unirse a la sala después de reconectar
            try {
                await this.joinRoom();
            } catch (error) {
                console.error("❌ Error al re-unirse después de reconexión:", error);
            }
        });

        this.connection.onclose((error) => {
            console.error("❌ [SignalR] Conexión cerrada:", error);
            this.updateConnectionStatus("Desconectado", "#ef4444");
        });

        // 4️⃣ INICIAR la conexión
        console.log("🔌 [SignalR] Iniciando conexión...");
        this.updateConnectionStatus("Conectando...", "#f59e0b");
        
        await this.connection.start();
        
        console.log("✅ [SignalR] Conexión establecida");
        console.log("✅ [SignalR] Estado:", this.connection.state);
        console.log("✅ [SignalR] Connection ID:", this.connection.connectionId);

        // 5️⃣ AHORA SÍ unirse a la sala (después de que la conexión está establecida)
        await this.joinRoom();

    } catch (error) {
        console.error("❌ [SignalR] Error al conectar:", error);
        console.error("❌ [SignalR] Error message:", error.message);
        console.error("❌ [SignalR] Error stack:", error.stack);
        
        this.updateConnectionStatus("Error de conexión", "#ef4444");
        
        // Mostrar error al usuario
        if (typeof this.showErrorMessage === 'function') {
            this.showErrorMessage(
                "No se pudo conectar al chat en tiempo real. " +
                "Verifica tu conexión e intenta recargar la página."
            );
        } else {
            console.error("⚠️ showErrorMessage no está definido");
        }
    }
}

// Dentro de tu clase ChatComponent, después del método init() o setupSignalR()

async loadMessages() {
    try {
        console.log("📥 [Mensajes] Cargando mensajes históricos...");
        console.log("📥 [Mensajes] Chat Room ID:", this.chatRoomId);
        console.log("📥 [Mensajes] User ID:", this.currentUserId);

        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #6b7280;">
                    <div class="spinner" style="width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <p style="margin-top: 1rem; font-size: 0.875rem;">Cargando mensajes...</p>
                </div>
            `;
        }

        const messagesResult = await getChatMessages(this.chatRoomId, this.currentUserId);
        
        console.log("📦 [Mensajes] Resultado recibido:", messagesResult);

        let messagesArray = [];
        
        if (Array.isArray(messagesResult)) {
            messagesArray = messagesResult;
        } else if (messagesResult && messagesResult.items) {
            messagesArray = messagesResult.items;
        } else if (messagesResult && messagesResult.Items) {
            messagesArray = messagesResult.Items;
        }

        console.log("✅ [Mensajes] Mensajes procesados:", messagesArray.length);
        
        this.messages = messagesArray;

        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        if (this.messages.length === 0) {
            messagesContainer.innerHTML = `
                <div style="text-align: center; color: #9ca3af; padding: 2rem; font-size: 0.875rem; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <i class="fas fa-comments" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.3;"></i>
                    <p>No hay mensajes aún. ¡Inicia la conversación!</p>
                </div>
            `;
        } else {
            this.messages.forEach((message) => {
                console.log("🎨 [UI] Renderizando mensaje:", message);
                this.addMessage(message, true);
            });
            
            this.scrollToBottom();
        }
        
        // ✅ CORRECCIÓN CRÍTICA: Usar el ID correcto según el userType
        try {
            console.log("✓ Marcando mensajes como leídos:", {
                chatRoomId: this.chatRoomId,
                currentUserId: this.currentUserId,
                userType: this.config.userType
            });
            
            // ✅ CLAVE: Determinar el ID correcto según el tipo de usuario
            let userIdForRead;
            let userRole;
            
            if (this.config.userType === 'doctor') {
                // Para doctor: usar el doctorId del chatRoom o de config
                userIdForRead = this.config.doctorId || this.currentUserId;
                userRole = 'Doctor';
            } else {
                // Para paciente: usar el patientId del chatRoom o de config
                userIdForRead = this.config.patientId || this.currentUserId;
                userRole = 'Patient';
            }
            
            console.log("✅ ID final para markAsRead:", {
                userIdForRead,
                userRole
            });
            
            await markMessagesAsRead(this.chatRoomId, userIdForRead, userRole);
            
            console.log("✅ Mensajes marcados como leídos");
        } catch (error) {
            console.warn("⚠️ No se pudieron marcar como leídos:", error);
            console.error("⚠️ Error completo:", error.message);
        }

    } catch (error) {
        console.error("❌ [Mensajes] Error al cargar:", error);
        console.error("❌ [Mensajes] Stack:", error.stack);
        
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div style="color: #ef4444; padding: 2rem; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.7;"></i>
                    <p style="font-weight: 500;">Error al cargar mensajes</p>
                    <p style="font-size: 0.875rem; opacity: 0.8; margin-top: 0.5rem;">${error.message}</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-size: 0.875rem;">Recargar página</button>
                </div>
            `;
        }

        this.messages = [];
    }
}

// ✅ Método auxiliar para unirse a la sala
async joinRoom() {
    try {
        console.log("🚪 [SignalR] Uniéndose a la sala...");
        console.log("🚪 [SignalR] Chat Room ID:", this.chatRoomId);
        console.log("🚪 [SignalR] User ID:", this.currentUserId);

        // Verificar que la conexión esté activa
        if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
            throw new Error("La conexión no está establecida");
        }

        // Invocar el método del Hub
        await this.connection.invoke("JoinChatRoom", this.chatRoomId, this.currentUserId);
        
        console.log("✅ [SignalR] Unido a la sala exitosamente");

    } catch (error) {
        console.error("❌ [SignalR] Error al unirse a la sala:", error);
        console.error("❌ [SignalR] Detalles:", {
            chatRoomId: this.chatRoomId,
            currentUserId: this.currentUserId,
            connectionState: this.connection?.state,
            errorMessage: error.message
        });

        if (typeof this.showErrorMessage === 'function') {
            this.showErrorMessage(
                "No se pudo unir a la sala de chat: " + error.message
            );
        }

        throw error;
    }
}

// ✅ Método auxiliar para actualizar el estado de conexión en la UI
updateConnectionStatus(text, color) {
    const statusEl = this.container?.querySelector("#connection-status");
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color || "inherit";
    }
    console.log(`📡 [Estado] ${text}`);
}

  //Renderiza todos los mensajes
  renderMessages() {
    const messagesContainer = document.getElementById("chat-messages");
    messagesContainer.innerHTML = "";

    if (this.messages.length === 0) {
      messagesContainer.innerHTML = `
                <div style="
                    text-align: center;
                    color: #9ca3af;
                    padding: 2rem;
                    font-size: 0.875rem;
                ">
                    <i class="fas fa-comments" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.3;"></i>
                    <p>No hay mensajes aún. ¡Inicia la conversación!</p>
                </div>
            `;
      return;
    }

    this.messages.forEach((message) => {
      this.addMessage(message, false);
    });
  }

  //Agrega un mensaje al chat
addMessage(message, append = true) {
    const messagesContainer = document.getElementById("chat-messages");
    
    const senderRole = message.senderRole || message.SenderRole;
    
    // ✅ Comparar por ROLE en vez de por ID
    const myRole = this.theme === "doctor" ? "Doctor" : "Patient";
    const isOwn = senderRole === myRole;
    
    console.log("🎨 [UI] Mensaje:", { senderRole, myRole, isOwn, message: message.message });

    const themeColor = this.theme === "doctor" ? "#10b981" : "#3b82f6";
    const bgColor = isOwn ? themeColor : "#f3f4f6";
    const textColor = isOwn ? "white" : "#1f2937";
    const alignment = isOwn ? "flex-end" : "flex-start";

    const messageTime = new Date(message.sentAt || message.SentAt);
    const timeString = messageTime.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
    });

    const messageEl = document.createElement("div");
    messageEl.style.cssText = `
        display: flex;
        justify-content: ${alignment};
        animation: slideIn 0.3s ease-out;
    `;

    messageEl.innerHTML = `
        <div style="
            max-width: 70%;
            background: ${bgColor};
            color: ${textColor};
            padding: 0.75rem 1rem;
            border-radius: ${isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px"};
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            word-wrap: break-word;
        ">
            <p style="margin: 0; font-size: 0.9375rem; line-height: 1.5;">
                ${message.message || message.Message}
            </p>
            <p style="
                margin: 0.25rem 0 0 0;
                font-size: 0.75rem;
                opacity: ${isOwn ? "0.8" : "0.6"};
                text-align: right;
            ">
                ${timeString}
            </p>
        </div>
    `;

    if (append) {
        messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    } else {
        messagesContainer.insertBefore(messageEl, messagesContainer.firstChild);
    }
}

  // Adjuntar event listeners
attachEventListeners() {
    const input = document.getElementById("chat-message-input");
    const sendBtn = document.getElementById("chat-send-btn");
    const container = this.container.querySelector('.chat-container');

    // Auto-resize del textarea
    if (input) {
        input.addEventListener("input", (e) => {
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
            this.handleTyping();
        });

        // Focus styles para input
        input.addEventListener("focus", (e) => {
            const themeColor = this.theme === "doctor" ? "#10b981" : "#3b82f6";
            e.target.style.borderColor = themeColor;
        });

        input.addEventListener("blur", (e) => {
            e.target.style.borderColor = "#d1d5db";
        });

        // Enviar con Enter
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    // Enviar con botón
    if (sendBtn) {
        sendBtn.addEventListener("mouseenter", () => {
            const accentColor = this.theme === "doctor" ? "#059669" : "#2563eb";
            sendBtn.style.transform = "scale(1.05)";
            sendBtn.style.background = accentColor;
        });

        sendBtn.addEventListener("mouseleave", () => {
            const primaryColor = this.theme === "doctor" ? "#10b981" : "#3b82f6";
            sendBtn.style.transform = "scale(1)";
            sendBtn.style.background = primaryColor;
        });

        sendBtn.addEventListener("click", () => this.sendMessage());
    }

    // ✅ Usar DELEGACIÓN DE EVENTOS en el contenedor
    if (container) {
        container.addEventListener("click", (e) => {
            const target = e.target;
            const button = target.closest('button');
            
            if (!button) return;

            const buttonId = button.id;

            // Botón CERRAR
            if (buttonId === "chat-close-btn") {
                e.stopPropagation();
                this.close();
                return;
            }

            // Botón MINIMIZAR
            if (buttonId === "chat-minimize-btn") {
                e.stopPropagation();
                
                const modal = document.getElementById('chat-modal');
                const header = container.querySelector('.chat-header');

                if(!header){
                    console.error("❌ Header no encontrado para minimizar/restaurar");
                    return;
                }

                const children = Array.from(container.children).filter(child => child !== header);

                // Guardamos valores iniciales solo la primera vez
                if(!modal.dataset.initialized) {
                    children.forEach(child => {
                        child.dataset.originalDisplay = window.getComputedStyle(child).display;
                    });

                    header.dataset.originalJustify = window.getComputedStyle(header).justifyContent;
                    modal.dataset.initialized = "true";
                }

                if (modal) {
                    if(modal.dataset.minimized === "true") {
                        // Restaurar
                        modal.dataset.minimized = "false";
                        modal.style.width = "400px";
                        modal.style.height = "600px";

                        children.forEach(child => {
                            child.style.display = child.dataset.originalDisplay;
                        });
                        
                        // Restauramos alineación original del header
                        header.style.justifyContent = header.dataset.originalJustify;
                        header.style.gap = '0';

                        button.innerHTML = '<i class="fas fa-minus"></i>';
                        button.title = 'Minimizar';

                        this.scrollToBottom();
                    } else {
                        // Minimizar
                        modal.dataset.minimized = "true";
                        modal.style.width = "400px";
                        modal.style.height = "70px";

                        children.forEach(child => {
                            child.style.display = "none";
                        });

                        // Centramos el header
                        header.style.justifyContent = "center";
                        header.style.gap = '1rem';

                        button.innerHTML = '<i class="fas fa-window-maximize"></i>';
                        button.title = 'Maximizar';
                    }
                }
                return;
            }
        });

        // ✅ Click en el HEADER para restaurar cuando está minimizado
        const header = container.querySelector('.chat-header');
        if (header) {
            header.addEventListener("click", (e) => {
                // Si clickeó en un botón, ignorar
                if (e.target.closest('button')) return;

                const modal = document.getElementById('chat-modal');
                if (modal?.dataset.minimized === "true") {
                    const minimizeBtn = document.getElementById('chat-minimize-btn');
                    if (minimizeBtn) {
                        minimizeBtn.click();
                    }
                }
            });
        }

        // ✅ Hover effects para botones del header
        container.addEventListener("mouseenter", (e) => {
            const button = e.target.closest('#chat-minimize-btn, #chat-close-btn');
            if (button) {
                button.style.background = "rgba(255,255,255,0.3)";
            }
        }, true);

        container.addEventListener("mouseleave", (e) => {
            const button = e.target.closest('#chat-minimize-btn, #chat-close-btn');
            if (button) {
                button.style.background = "rgba(255,255,255,0.2)";
            }
        }, true);
    }
}

  // Notificar que está escribiendo
handleTyping() {
    if (!this.isTyping) {
      this.isTyping = true;
      this.connection?.invoke(
        "UserTyping",
        this.chatRoomId,
        this.currentUserId,
        this.currentUserName
      );
    }

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.isTyping = false;
      this.connection?.invoke(
        "UserStoppedTyping",
        this.chatRoomId,
        this.currentUserId
      );
    }, 1000);
  }

  // Mostrar el indicador de escritura
  showTypingIndicator() {
    const indicator = document.getElementById("typing-indicator");
    if (indicator) {
      indicator.style.display = "block";
    }
  }

  // Ocultar el indicador de escritura
  hideTypingIndicator() {
    const indicator = document.getElementById("typing-indicator");
    if (indicator) {
      indicator.style.display = "none";
    }
  }

  // Enviar el mensaje
  // ============================================
// CAMBIO 1: Reemplaza el método sendMessage() completo
// Línea ~569 de tu archivo
// ============================================

async sendMessage() {
    try {
        const input = document.getElementById('chat-message-input');
        
        if (!input) {
            console.error("❌ [UI] Input no encontrado");
            return;
        }

        const content = input.value?.trim();
        
        if (!content) return;

        const messageRequest = {
            ChatRoomId: this.chatRoomId,
            SenderId: this.currentUserId,
            Message: content,
            SenderInfo: {
                Id: this.currentUserId,
                Name: this.currentUserName,
                Role: this.theme === "doctor" ? "Doctor" : "Patient"  // ✅ Esto ya lo tenías
            }
        };

        console.log("📦 [Mensaje] Request a enviar:", messageRequest);

        await this.connection.invoke("SendMessage", messageRequest);
        
        input.value = '';
        input.style.height = 'auto';
        input.focus();

    } catch (error) {
        console.error("❌ Error al enviar mensaje:", error);
        alert("No se pudo enviar el mensaje.");
    }
}

// ============================================
// CAMBIO 2: Agrega este método nuevo después de sendMessage()
// ============================================

// Agregar mensaje recibido a la UI
addMessageToUI(message) {
    console.log("➕ [UI] Agregando mensaje recibido:", message);
    
    if (!message) {
        console.warn("⚠️ [UI] Mensaje vacío recibido");
        return;
    }

    // Agregar al array de mensajes
    this.messages.push(message);
    
    // Agregar visualmente al chat
    this.addMessage(message, true);
    
    // Scroll al final
    this.scrollToBottom();
    
    // Marcar como leído si no es propio
    const senderId = message.senderId || message.SenderId;
    if (senderId !== this.currentUserId) {
        this.markAsRead();
    }
}

// Marcar mensajes como leídos
async markAsRead() {
    try {
        if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('MarkAsRead', this.chatRoomId, this.currentUserId);
            console.log("✅ Mensajes marcados como leídos");
        }
    } catch (error) {
        console.warn("⚠️ Error al marcar como leídos:", error);
    }
}

  // Desplazar hacia abajo
  scrollToBottom() {
    const messagesContainer = document.getElementById("chat-messages");
    if (messagesContainer) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 100);
    }
  }

  // Cerrar el chat
  async close() {
    try {
      await this.connection?.invoke("LeaveChatRoom", this.chatRoomId);
      await this.connection?.stop();
    } catch (error) {
      console.error("Error al cerrar chat:", error);
    }

    this.container.innerHTML = "";

    // Callback de cierre si existe
    if (this.onClose) {
      this.onClose();
    }
  }
}

// Agregar animación CSS
const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;

document.head.appendChild(style);
