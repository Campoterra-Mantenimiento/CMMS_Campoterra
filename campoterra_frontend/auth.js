const DASHBOARD_TOKEN_KEY = 'campoterra_access_token';

function getSessionToken() {
    return sessionStorage.getItem(DASHBOARD_TOKEN_KEY)
        || localStorage.getItem(DASHBOARD_TOKEN_KEY);
}

function clearSession() {
    sessionStorage.removeItem(DASHBOARD_TOKEN_KEY);
    localStorage.removeItem(DASHBOARD_TOKEN_KEY);
    sessionStorage.removeItem('campoterra_username');
    localStorage.removeItem('campoterra_username');
}

function requireSession() {
    if (!getSessionToken()) {
        window.location.replace('login.html');
        return false;
    }
    return true;
}

async function authenticatedFetch(url, options = {}) {
    if (window.CampoterraCloud.enabled) return window.CampoterraCloud.request(url, options);
    const token = getSessionToken();
    if (!token) {
        window.location.replace('login.html');
        throw new Error('Sesión no disponible');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        clearSession();
        window.location.replace('login.html');
    }
    return response;
}

function configureLogoutLinks() {
    document.querySelectorAll('a[href="login.html"]').forEach(link => {
        link.addEventListener('click', async event => {
            event.preventDefault();
            clearSession();
            if (window.CampoterraCloud.enabled) await window.CampoterraCloud.logout();
            window.location.replace('login.html');
        });
    });
}

if (window.CampoterraCloud.enabled) {
    const pages = ['dashboard.html', 'bitacoras.html', 'reportes.html', 'inventario.html', 'maquinaria.html', 'personal.html', 'areas.html', 'evaluaciones.html'];
    if (!pages.includes(location.pathname.split('/').pop())) location.replace('dashboard.html');
    window.CampoterraCloud.requireSession().catch(error => {
        if (error.status === 401 || error.status === 403) location.replace('login.html');
    });
    document.addEventListener('DOMContentLoaded', () => {
        configureLogoutLinks();
        document.querySelectorAll('#profile-form button[type="submit"]').forEach(button => {
            button.disabled = true; button.title = 'No disponible en esta etapa del piloto';
        });
    });
} else if (requireSession()) {
    document.addEventListener('DOMContentLoaded', configureLogoutLinks);
}
