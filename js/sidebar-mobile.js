/**
 * sidebar-mobile.js
 * Hamburger drawer compartido para todos los paneles.
 * Incluir al final del <body> en client.html, fumigator.html,
 * provider.html y admin.html.
 */
(function () {
    'use strict';

    const toggle   = document.getElementById('sidebarToggle');
    const backdrop = document.getElementById('sidebarBackdrop');
    const sidebar  = document.querySelector('.dashboard-sidebar');

    if (!toggle || !sidebar) return;

    function openSidebar() {
        sidebar.classList.add('is-open');
        backdrop?.classList.add('is-visible');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.querySelector('i')?.classList.replace('fa-bars', 'fa-times');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        sidebar.classList.remove('is-open');
        backdrop?.classList.remove('is-visible');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelector('i')?.classList.replace('fa-times', 'fa-bars');
        document.body.style.overflow = '';
    }

    toggle.addEventListener('click', function () {
        sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar();
    });

    backdrop?.addEventListener('click', closeSidebar);

    // Cerrar al tocar un nav-item (el JS del panel ya hace la navegación)
    sidebar.querySelectorAll('.nav-item').forEach(function (item) {
        item.addEventListener('click', closeSidebar);
    });

    // Cerrar con Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSidebar();
    });
})();
