(() => {
    function setup() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.id = 'main-navigation';
            sidebar.setAttribute('aria-label', 'Navegación principal');
            const bar = document.createElement('div');
            bar.className = 'mobile-nav-bar';
            const title = document.createElement('strong'); title.textContent = 'CAMPOTERRA';
            const toggle = document.createElement('button');
            toggle.type = 'button'; toggle.textContent = '☰ Menú';
            toggle.setAttribute('aria-controls', sidebar.id);
            toggle.setAttribute('aria-expanded', 'false');
            bar.append(title, toggle); sidebar.before(bar);
            document.body.classList.add('mobile-ready');
            function close() {
                document.body.classList.remove('nav-open');
                toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = '☰ Menú';
            }
            toggle.addEventListener('click', () => {
                const open = document.body.classList.toggle('nav-open');
                toggle.setAttribute('aria-expanded', String(open));
                toggle.textContent = open ? 'Cerrar menú' : '☰ Menú';
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && document.body.classList.contains('nav-open')) { close(); toggle.focus(); }
            });
            sidebar.addEventListener('click', event => { if (event.target.closest('a')) close(); });
            window.matchMedia('(max-width: 991.98px)').addEventListener('change', close);
        }
        document.querySelectorAll('.main-content table').forEach(table => {
            let wrapper = table.closest('.table-responsive');
            if (!wrapper) {
                wrapper = document.createElement('div'); wrapper.className = 'table-responsive';
                table.before(wrapper); wrapper.append(table);
            }
            wrapper.tabIndex = 0;
            wrapper.setAttribute('role', 'region');
            wrapper.setAttribute('aria-label', 'Tabla de datos. Desliza horizontalmente para ver más columnas.');
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
})();
