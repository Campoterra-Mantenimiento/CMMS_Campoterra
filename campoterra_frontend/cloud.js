/* Adaptador de consultas: conserva los contratos de las páginas existentes. */
(() => {
    const config = window.CAMPOTERRA_CONFIG;
    const enabled = config?.backend === 'supabase';
    const storageKey = 'campoterra-pilot-auth';
    let remember = localStorage.getItem('campoterra-pilot-remember') === 'true';
    const storage = {
        getItem: key => (remember ? localStorage : sessionStorage).getItem(key),
        setItem: (key, value) => (remember ? localStorage : sessionStorage).setItem(key, value),
        removeItem: key => { localStorage.removeItem(key); sessionStorage.removeItem(key); },
    };
    const client = enabled ? window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
        auth: { storage, storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    }) : null;
    async function result(query) {
        const { data, error, status } = await query;
        if (error) throw Object.assign(new Error(error.message), { status: status || 503 });
        return data;
    }
    async function profile() {
        return result(client.rpc('acceso_encargado'));
    }
    async function logout() {
        if (client) await client.auth.signOut({ scope: 'local' });
        storage.removeItem(storageKey);
    }
    async function login(email, password, persist) {
        await logout();
        remember = !!persist;
        localStorage.setItem('campoterra-pilot-remember', String(remember));
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        try { return await profile(); }
        catch (error) { await logout(); throw error; }
    }
    async function requireSession() {
        const { data, error } = await client.auth.getSession();
        if (error || !data.session) throw Object.assign(new Error('Inicia sesión con la cuenta del encargado.'), { status: 401 });
        return profile();
    }
    // PostgREST limita cada respuesta: paginar evita omitir registros silenciosamente.
    async function allRows(table, columns, order) {
        const rows = [];
        const size = 500;
        for (let offset = 0; ; offset += size) {
            const page = await result(client.from(table).select(columns).order(order).range(offset, offset + size - 1));
            rows.push(...page);
            if (page.length < size) return rows;
        }
    }
    async function reports() {
        const rows = await allRows('bitacoras', '*,equipo:equipos(nombre),area:areas_mantenimiento(nombre),tecnico:tecnicos(nombre),turno:turnos(descripcion)', 'id_bitacora');
        return rows.map(({ equipo, area, tecnico, turno, ...row }) => ({ ...row,
            nombre_equipo: equipo?.nombre || null, nombre_area: area?.nombre || null,
            nombre_tecnico: tecnico?.nombre || '', turno: turno?.descripcion || '',
        })).sort((a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro) || b.id_bitacora - a.id_bitacora);
    }
    function weekly(rows, year, week) {
        if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(week) || week < 1) {
            throw Object.assign(new Error('Año o semana inválidos'), { status: 422 });
        }
        const first = new Date(year, 0, 1);
        first.setDate(first.getDate() - first.getDay());
        const max = Math.ceil((new Date(year + 1, 0, 1) - first) / 86400000 / 7);
        if (week > max) throw Object.assign(new Error('Semana inválida'), { status: 422 });
        const start = new Date(first); start.setDate(first.getDate() + (week - 1) * 7);
        const end = new Date(start); end.setDate(start.getDate() + 7);
        const last = new Date(end); last.setDate(last.getDate() - 1);
        const date = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const selected = rows.filter(r => new Date(r.fecha_registro) >= start && new Date(r.fecha_registro) < end);
        return { year, week, inicio: date(start), fin: date(last), total: selected.length,
            preventivos: selected.filter(r => r.tipo_mantenimiento.toLowerCase() === 'preventivo').length,
            correctivos: selected.filter(r => r.tipo_mantenimiento.toLowerCase() === 'correctivo').length, bitacoras: selected };
    }
    async function request(url, options = {}) {
        try {
            const user = await requireSession();
            const parsed = new URL(url, location.href);
            const route = parsed.pathname.replace(/\/$/, '');
            const method = (options.method || 'GET').toUpperCase();
            if (method !== 'GET') {
                const body = options.body ? JSON.parse(options.body) : {};
                const catalog = route.match(/^\/api\/(equipos|tecnicos|areas)(?:\/(\d+))?(\/status)?$/);
                const entry = route.match(/^\/api\/piezas\/(\d+)\/entradas$/);
                const notification = route.match(/^\/api\/notificaciones\/(\d+)\/leer$/);
                let changed;
                if (/^\/api\/actividades\/[0-9a-f-]{36}$/i.test(route) && method === 'DELETE') {
                    changed = await result(client.rpc('eliminar_actividad', {
                        p_id: route.split('/')[3], p_revision: body.revision
                    }));
                } else if (route === '/api/actividades' && method === 'POST') {
                    changed = await result(client.rpc('guardar_actividad', {
                        p_id: body.id_actividad, p_tecnico: body.id_tecnico, p_fecha: body.fecha_trabajo,
                        p_descripcion: body.descripcion, p_tipo: body.tipo, p_estado: body.estado,
                        p_observaciones: body.observaciones, p_revision: body.revision, p_turno: body.turno ?? null
                    }));
                } else if (route === '/api/evaluaciones' && method === 'POST') {
                    changed = await result(client.rpc('guardar_evaluacion', {
                        p_tecnico: body.id_tecnico, p_turno: body.id_turno, p_fecha: body.fecha_trabajo,
                        p_calidad: body.calidad, p_cumplimiento: body.cumplimiento, p_orden: body.orden,
                        p_documentacion: body.documentacion, p_observaciones: body.observaciones, p_revision: body.revision
                    }));
                } else if (catalog && ['POST','PUT','DELETE','PATCH'].includes(method)) {
                    const action = { POST: 'crear', PUT: 'editar', DELETE: 'eliminar', PATCH: 'estado' }[method];
                    if ((method === 'POST' && catalog[2]) || (method !== 'POST' && !catalog[2])
                        || (method === 'PATCH' && (catalog[1] !== 'areas' || !catalog[3]))) {
                        return Response.json({ detail: 'Operación inválida' }, { status: 405 });
                    }
                    changed = await result(client.rpc('administrar_catalogo', { p_catalogo: catalog[1], p_accion: action,
                        p_id: catalog[2] ? Number(catalog[2]) : null,
                        p_datos: method === 'PATCH' ? { activa: parsed.searchParams.get('activa') === 'true' } : body }));
                } else if (route === '/api/piezas' && method === 'POST') {
                    changed = await result(client.rpc('crear_refaccion', { p_nombre: body.nombre,
                        p_codigo: body.codigo, p_categoria: body.categoria }));
                } else if (/^\/api\/piezas\/\d+\/minimo$/.test(route) && method === 'PUT') {
                    changed = await result(client.rpc('configurar_minimo_refaccion', {
                        p_pieza: Number(route.split('/')[3]), p_minimo: body.stock_minimo
                    }));
                } else if (entry && method === 'POST') {
                    const pending = `entrada-${user.username}-${entry[1]}-${JSON.stringify(body)}`;
                    let key = sessionStorage.getItem(pending);
                    if (!key) { key = crypto.randomUUID(); sessionStorage.setItem(pending, key); }
                    changed = await result(client.rpc('registrar_entrada', { p_clave: key, p_pieza: Number(entry[1]),
                        p_cantidad: body.cantidad, p_motivo: body.motivo || 'Reabastecimiento' }));
                    sessionStorage.removeItem(pending);
                } else if (method === 'POST' && (notification || route === '/api/notificaciones/leer-todas')) {
                    changed = await result(client.rpc('leer_notificaciones', { p_id: notification ? Number(notification[1]) : null }));
                } else return Response.json({ detail: 'Operación aún no disponible en Supabase.' }, { status: 405 });
                return Response.json(changed);
            }
            let data;
            if (route === '/api/mi-perfil') data = user;
            else if (route === '/api/bitacoras') data = await reports();
            else if (route === '/api/piezas') data = await allRows('piezas', '*', 'id_pieza');
            else if (route === '/api/equipos') data = await allRows('equipos', '*', 'id_equipo');
            else if (route === '/api/tecnicos') data = await allRows('tecnicos', '*', 'id_tecnico');
            else if (route === '/api/turnos') data = await allRows('turnos', '*', 'id_turno');
            else if (route === '/api/evaluaciones' || route === '/api/actividades') {
                const desde = parsed.searchParams.get('desde'), hasta = parsed.searchParams.get('hasta');
                if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '') || desde > hasta)
                    return Response.json({ detail: 'Rango de fechas inválido' }, { status: 422 });
                data = [];
                for (let offset = 0; ; offset += 500) {
                    const activities = route === '/api/actividades';
                    const page = await result(client.from(activities ? 'actividades_mantenimiento' : 'evaluaciones').select('*').gte('fecha_trabajo', desde)
                        .lte('fecha_trabajo', hasta).order(activities ? 'id_actividad' : 'id_evaluacion').range(offset, offset + 499));
                    data.push(...page); if (page.length < 500) break;
                }
            }
            else if (route === '/api/areas') data = await allRows('areas_mantenimiento', '*', 'id_area');
            else if (route === '/api/inventario/movimientos') {
                data = (await allRows('movimientos_piezas', '*,pieza:piezas(nombre)', 'id_movimiento'))
                    .map(({ pieza, ...row }) => ({ ...row, nombre_pieza: pieza?.nombre || '' }))
                    .sort((a, b) => b.id_movimiento - a.id_movimiento);
            } else if (route === '/api/notificaciones') {
                const rows = await allRows('notificaciones', '*', 'id_notificacion');
                data = { no_leidas: rows.filter(r => !r.leida).length,
                    notificaciones: rows.sort((a, b) => b.id_notificacion - a.id_notificacion).slice(0, 50) };
            } else if (route === '/api/dashboard/weekly') {
                data = weekly(await reports(), Number(parsed.searchParams.get('year')), Number(parsed.searchParams.get('week')));
            } else if (route === '/api/dashboard/stats') {
                const start = new Date(); start.setHours(0, 0, 0, 0);
                const end = new Date(start); end.setDate(end.getDate() + 1);
                const rows = (await reports()).filter(r => new Date(r.fecha_registro) >= start && new Date(r.fecha_registro) < end);
                const corrective = rows.filter(r => r.tipo_mantenimiento.toLowerCase() === 'correctivo').length;
                data = { completados_hoy: rows.length, pendientes: 0, fallas_abiertas: corrective, alertas_criticas: corrective,
                    preventivos: rows.length ? Math.round(rows.filter(r => r.tipo_mantenimiento.toLowerCase() === 'preventivo').length * 100 / rows.length) : 0 };
            } else return Response.json({ detail: 'Esta sección todavía no está disponible en el piloto.' }, { status: 404 });
            return Response.json(data);
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                await logout(); location.replace('login.html');
            }
            return Response.json({ detail: error.message }, { status: error.status >= 400 && error.status <= 599 ? error.status : 503 });
        }
    }
    window.CampoterraCloud = { enabled, login, logout, requireSession, request, weekly };
    window.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
})();
