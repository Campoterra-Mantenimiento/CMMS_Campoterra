/* Planificación y seguimiento del encargado, independiente de las calificaciones. */
(() => {
    const $ = id => document.getElementById(id), esc = window.escapeHtml;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    let technicians = [], rows = [], loaded = null, editing = null, busy = false, dirty = false, page = 1;
    const pageSize = 10;
    function showTab(activities) {
        $('activities-view').hidden = !activities; $('grades-view').hidden = activities;
        $('grades-week-chip').hidden = activities;
        $('tab-activities').setAttribute('aria-pressed', String(activities));
        $('tab-grades').setAttribute('aria-pressed', String(!activities));
    }
    $('tab-activities').onclick = () => showTab(true);
    $('tab-grades').onclick = () => showTab(false);
    const status = () => document.querySelector('input[name="act-result"]:checked').value;
    function setStatus(value) {
        document.querySelectorAll('input[name="act-result"]').forEach(radio => radio.checked = radio.value === value);
        $('act-status-help').textContent = value === 'No realizada' ? 'Explica el motivo en observaciones.' : value === 'Realizada' ? 'Se registra como realizada; la calificación sigue siendo manual.' : 'Permanece pendiente en su fecha original. No se reprograma automáticamente.';
        $('act-notes').required = value === 'No realizada';
    }
    document.querySelectorAll('input[name="act-result"]').forEach(radio => radio.addEventListener('change', () => setStatus(radio.value)));

    const label = date => new Date(date + 'T12:00:00Z').toLocaleDateString('es-MX', { timeZone: 'UTC' });
    function range(date, period) {
        const start = new Date(date + 'T12:00:00Z');
        if (period === 'semana') start.setUTCDate(start.getUTCDate() - start.getUTCDay());
        const end = new Date(start); if (period === 'semana') end.setUTCDate(end.getUTCDate() + 6);
        return [start, end].map(d => d.toISOString().slice(0, 10));
    }
    function message(text, type = 'danger') { $('act-message').className = 'alert alert-' + type; $('act-message').textContent = text; }
    function controls() {
        ['act-load','act-date','act-tech','act-period','act-fields','act-report-year','act-report-week','act-report-tech'].forEach(id => $(id).disabled = busy);
        $('act-new').disabled = busy || !loaded;
        ['act-export-excel','act-export-pdf','act-export-day-pdf'].forEach(id=>$(id).disabled=busy || !loaded);
    }
    function leave() { return !dirty || confirm('Hay cambios en la actividad sin guardar. ¿Deseas descartarlos?'); }
    function close() { editing = null; dirty = false; $('act-form').hidden = true; }
    async function request(route, options) {
        const response = await authenticatedFetch('http://localhost:8000/api/' + route, options);
        const data = await response.json();
        if (!response.ok) throw new Error(/schema cache|does not exist|could not find/i.test(data.detail || '')
            ? 'Falta instalar 202611120013_turnos_actividades.sql en Supabase para usar las actividades.' : data.detail || 'No se pudo completar la operación.');
        return data;
    }
    function render() {
        const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        const search = normalize($('act-search').value.trim());
        const filtered = rows.filter(r => (!loaded.tech || String(r.id_tecnico) === loaded.tech)
            && (!search || normalize([r.descripcion,r.observaciones,r.tipo,r.estado,r.turno,technicians.find(t => t.id_tecnico === r.id_tecnico)?.nombre].join(' ')).includes(search)))
            .sort((a,b) => a.fecha_trabajo.localeCompare(b.fecha_trabajo) || a.creado_en.localeCompare(b.creado_en) || a.id_actividad.localeCompare(b.id_actividad));
        const count = state => filtered.filter(r => r.estado === state).length;
        $('act-range').textContent = (loaded.period === 'dia' ? 'Día: ' : 'Semana: ') + label(loaded.start) + (loaded.period === 'semana' ? ' al ' + label(loaded.end) : '') + ' · ' + (technicians.find(t => String(t.id_tecnico) === loaded.tech)?.nombre || 'Todos los técnicos');
        $('act-summary').textContent = `${filtered.length} actividades · ${count('Realizada')} realizadas · ${count('Pendiente')} pendientes · ${count('No realizada')} no realizadas · ${filtered.filter(r => r.tipo === 'Emergente').length} emergentes`;
        $('act-total').textContent=filtered.length; $('act-pending').textContent=count('Pendiente'); $('act-done').textContent=count('Realizada'); $('act-missed').textContent=count('No realizada');
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); page = Math.min(page, pages);
        $('act-rows').innerHTML = filtered.slice((page-1)*pageSize,page*pageSize).map(r => {
            const name = technicians.find(t => t.id_tecnico === r.id_tecnico)?.nombre || 'Técnico no disponible';
            return `<tr><td>${esc(label(r.fecha_trabajo))}<br><strong>${esc(name)}</strong></td><td>${esc(r.turno || 'Sin asignar')}</td><td style="min-width:180px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.descripcion)}</td><td><span class="activity-type ${r.tipo === 'Emergente' ? 'emergent' : ''}">${esc(r.tipo)}</span></td><td><span class="badge ${r.estado === 'Realizada' ? 'bg-success' : r.estado === 'No realizada' ? 'bg-danger' : 'bg-secondary'}">${esc(r.estado)}</span></td><td style="min-width:150px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.observaciones || '—')}</td><td><div class="d-flex gap-1">${r.estado !== 'Realizada' ? `<button type="button" class="btn btn-sm btn-outline-success" data-quick="Realizada" data-activity="${esc(r.id_actividad)}" aria-label="Marcar realizada" title="Marcar realizada">✓</button>` : ''}<button type="button" class="btn btn-sm btn-outline-danger" data-quick="No realizada" data-activity="${esc(r.id_actividad)}" aria-label="Registrar no realizada" title="Registrar no realizada">×</button><button type="button" class="btn btn-sm btn-outline-primary" data-activity="${esc(r.id_actividad)}">Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-delete="${esc(r.id_actividad)}">Eliminar</button></div></td></tr>`;
        }).join('') || '<tr><td colspan="7">No hay actividades registradas para esta consulta.</td></tr>';
        $('act-page-label').textContent = `Página ${page} de ${pages}`;
        $('act-prev').disabled = page === 1; $('act-next').disabled = page === pages;
    }
    async function load() {
        if (busy || !leave()) return;
        const date = $('act-date').value, tech = $('act-tech').value, period = $('act-period').value;
        if (!date) { message('Selecciona una fecha.'); return; }
        const [start,end] = range(date, period);
        busy = true; controls(); close();
        try {
            const [ts, rs] = await Promise.all([request('tecnicos'), request(`actividades?desde=${start}&hasta=${end}`)]);
            technicians = ts; rows = rs; loaded = {date,tech,period,start,end}; page = 1;
            $('act-tech').replaceChildren(new Option('Todos', ''));
            technicians.forEach(t => $('act-tech').add(new Option(t.nombre + (t.estado !== 'Activo' ? ' (Inactivo)' : ''),t.id_tecnico)));
            const reportTech=$('act-report-tech').value;
            $('act-report-tech').replaceChildren(new Option('Todos',''));
            technicians.forEach(t=>$('act-report-tech').add(new Option(t.nombre,t.id_tecnico)));
            $('act-report-tech').value=reportTech;
            $('act-tech').value = tech; $('act-message').className = 'alert d-none'; render();
        } catch(e) {
            loaded = null; rows = []; message(e.message);
            $('act-rows').innerHTML = '<tr><td colspan="7">No se pudieron cargar las actividades. Pulsa Consultar para reintentar.</td></tr>';
            ['act-total','act-pending','act-done','act-missed'].forEach(id => $(id).textContent = '—');
            ['act-summary','act-range','act-page-label'].forEach(id => $(id).textContent = '');
            $('act-prev').disabled = true; $('act-next').disabled = true;
        } finally { busy = false; controls(); }
    }
    function open(record) {
        if (busy || !loaded || !leave()) return false;
        editing = record ? {...record} : {id_actividad:crypto.randomUUID(), revision:0}; dirty = false;
        $('act-assignee').replaceChildren(new Option('Selecciona un técnico', ''));
        technicians.filter(t => t.estado === 'Activo' || t.id_tecnico === record?.id_tecnico).forEach(t => $('act-assignee').add(new Option(t.nombre,t.id_tecnico)));
        $('act-shift').value = record?.turno || '';
        $('act-shift').options[0].disabled = !!record?.turno;
        $('act-work-date').value = record?.fecha_trabajo || loaded.date;
        $('act-assignee').value = record ? String(record.id_tecnico) : loaded.tech;
        $('act-work-date').disabled = $('act-assignee').disabled = !!record;
        $('act-description').value = record?.descripcion || ''; $('act-type').value = record?.tipo === 'Planeada' ? '' : record?.tipo || 'Preventiva';
        setStatus(record?.estado || 'Pendiente'); $('act-notes').value = record?.observaciones || '';
        $('act-another').checked = false; $('act-another').disabled = !!record;
        $('act-form-title').textContent = record ? 'Revisar actividad' : 'Nueva actividad';
        if (record?.tipo === 'Planeada') message('Esta actividad se guardó como Planeada. Selecciona su tipo antes de guardar.', 'info');
        $('act-form').hidden = false; $('act-description').focus();
        return true;
    }
    $('act-form').addEventListener('input', () => {dirty = true;});
    $('act-form').addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !editing) return;
        const body = {...editing, id_tecnico:Number($('act-assignee').value), fecha_trabajo:$('act-work-date').value,
            turno:$('act-shift').value || null, descripcion:$('act-description').value.trim(), tipo:$('act-type').value, estado:status(), observaciones:$('act-notes').value.trim()};
        if (!body.turno && editing.revision === 0) {message('Selecciona el turno de la actividad.'); return;}
        if (!['Preventiva','Correctiva','Emergente'].includes(body.tipo)) {message('Selecciona Preventiva, Correctiva o Emergente.'); return;}
        if (!body.id_tecnico || !body.descripcion || !body.fecha_trabajo) {message('Completa fecha, técnico y actividad.'); return;}
        if (body.estado === 'No realizada' && !body.observaciones) {message('Indica por qué no se realizó la actividad.'); return;}
        if (body.fecha_trabajo > today && (body.tipo === 'Emergente' || body.estado !== 'Pendiente')) {message('Para fechas futuras solo puedes planear actividades pendientes.'); return;}
        const another = $('act-another').checked && editing.revision === 0;
        let succeeded = false;
        busy = true; controls();
        try {
            const saved = await request('actividades', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
            rows = rows.filter(r => r.id_actividad !== saved.id_actividad);
            if (saved.fecha_trabajo >= loaded.start && saved.fecha_trabajo <= loaded.end) rows.push(saved);
            const visible = saved.fecha_trabajo >= loaded.start && saved.fecha_trabajo <= loaded.end && (!loaded.tech || String(saved.id_tecnico) === loaded.tech);
            succeeded = true; close(); render(); message('Actividad guardada.' + (visible ? '' : ' Consulta su fecha y técnico para verla.') + ' Las calificaciones no se modificaron.', 'success');
        } catch(e) {message(e.message + ' Si la respuesta fue incierta, consulta de nuevo antes de cambiar la actividad.');}
        finally {busy = false; controls();}
        if (succeeded && another) {
            open(null); $('act-work-date').value=body.fecha_trabajo; $('act-assignee').value=String(body.id_tecnico);
            $('act-shift').value=body.turno || ''; $('act-type').value=body.tipo; $('act-another').checked=true;
        }
    });
    async function removeActivity(record) {
        if (busy) return;
        if (editing?.id_actividad === record.id_actividad && !leave()) return;
        const name=technicians.find(t=>t.id_tecnico===record.id_tecnico)?.nombre || 'Técnico';
        if (!confirm(`¿Eliminar esta actividad?\n\n${name} · ${label(record.fecha_trabajo)}\n${record.descripcion}\n\nNo se puede deshacer. No modifica las calificaciones ni las bitácoras.`)) return;
        busy=true;controls();
        try {
            await request(`actividades/${record.id_actividad}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:record.revision})});
            rows=rows.filter(r=>r.id_actividad!==record.id_actividad);
            if(editing?.id_actividad===record.id_actividad)close();
            render();message('Actividad eliminada. Los conteos se actualizaron.','success');
        }catch(e){message(/schema cache|does not exist|could not find|Falta instalar/i.test(e.message)
            ? 'Falta instalar 202611040012_eliminar_actividades.sql en Supabase.'
            : e.message+' Si no recibiste confirmación, consulta de nuevo para verificar si se eliminó.');}
        finally{busy=false;controls();}
    }
    $('act-rows').addEventListener('click', event => {
        const remove=event.target.closest('[data-delete]');
        if(remove){const record=rows.find(r=>r.id_actividad===remove.dataset.delete);if(record)removeActivity(record);return;}

        const button = event.target.closest('[data-activity]'); if (!button) return;
        const record = rows.find(r => r.id_actividad === button.dataset.activity);
        if (!record || busy) return;
        if (!open(record)) return;
        if (button.dataset.quick) {
            setStatus(button.dataset.quick); dirty=true;
            if (button.dataset.quick === 'Realizada') $('act-form').requestSubmit();
            else $('act-notes').focus();
        }
    });
    $('act-search').addEventListener('input', () => {if (loaded) {page=1;render();}});
    $('act-new').onclick = () => open(null); $('act-load').onclick = load;
    $('act-cancel').onclick = () => {if (!busy && leave()) close();};
    $('act-prev').onclick = () => {if (loaded && !busy) {page--; render();}};
    $('act-next').onclick = () => {if (loaded && !busy) {page++; render();}};
    window.addEventListener('beforeunload', e => {if (dirty) {e.preventDefault(); e.returnValue='';}});
    window.addEventListener('campoterra:actividades', async e => {
        if (busy || !leave()) return;
        showTab(true); close(); $('act-search').value=''; $('act-date').value=e.detail.date; $('act-tech').value=String(e.detail.tech); $('act-period').value='dia';
        await load(); $('actividades-panel').scrollIntoView({behavior:'smooth',block:'start'});
    });
    function reportPeriod() {
        return window.CampoterraActivitiesExport.weekRange(Number($('act-report-year').value),Number($('act-report-week').value));
    }
    function reportRange() {
        try {const w=reportPeriod();$('act-report-range').textContent=`Semana ${w.week} de ${w.year}: ${label(w.start)} al ${label(w.end)}`;}
        catch(e){$('act-report-range').textContent=e.message;}
    }
    async function exportActivities(format, daily = false) {
        if(busy || !loaded)return;
        try {
            const date=$('act-date').value;
            if (daily && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T12:00:00Z')))) throw new Error('Selecciona una fecha válida para el PDF diario.');
            const w=daily ? {start:date,end:date,daily:true} : reportPeriod(),tech=$(daily ? 'act-tech' : 'act-report-tech').value;
            busy=true;controls();
            message(daily ? 'Preparando el reporte diario…' : 'Preparando el reporte semanal…','info');
            const records=await request(`actividades?desde=${w.start}&hasta=${w.end}`);
            const report=window.CampoterraActivitiesExport.prepare(records,technicians,{...w,tech});
            await window.CampoterraActivitiesExport[format](report);
            message(daily ? `Reporte diario generado: ${label(date)}. Incluye solo actividades guardadas.` : `Reporte generado: semana ${w.week} de ${w.year}. Incluye solo actividades guardadas.`, 'success');
        }catch(e){message(e.message);}
        finally{busy=false;controls();}
    }
    $('act-export-excel').onclick=()=>exportActivities('excel');
    $('act-export-pdf').onclick=()=>exportActivities('pdf');
    $('act-export-day-pdf').onclick=()=>exportActivities('pdf',true);
    ['act-report-year','act-report-week'].forEach(id=>$(id).addEventListener('input',reportRange));
    const year=Number(today.slice(0,4)),first=new Date(Date.UTC(year,0,1,12));
    first.setUTCDate(first.getUTCDate()-first.getUTCDay());
    $('act-report-year').value=year;
    $('act-report-week').value=Math.floor((new Date(today+'T12:00:00Z')-first)/604800000)+1;
    reportRange();
    $('act-date').value = today; load();
})();
