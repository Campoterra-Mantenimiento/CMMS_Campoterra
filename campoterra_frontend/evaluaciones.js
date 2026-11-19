/* Evaluaciones exclusivas del encargado. No importa ni modifica el Excel. */
(() => {
    const $ = id => document.getElementById(id);
    const fields = ['calidad', 'cumplimiento', 'orden', 'documentacion'];
    const labels = ['Calidad del trabajo', 'Cumplimiento de la tarea', 'Orden y limpieza', 'Reporte y documentación'];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    let technicians = [], records = [], selected = null, revision = 0, loadedDate = '', busy = false, dirty = false;
    const esc = window.escapeHtml;
    const iso = d => d.toISOString().slice(0, 10);
    function week(date) {
        const day = new Date(date + 'T12:00:00Z');
        const start = new Date(day); start.setUTCDate(day.getUTCDate() - day.getUTCDay());
        const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
        const first = new Date(Date.UTC(day.getUTCFullYear(), 0, 1, 12)); first.setUTCDate(first.getUTCDate() - first.getUTCDay());
        return { start: iso(start), end: iso(end), number: Math.round((start - first) / 604800000) + 1, year: day.getUTCFullYear() };
    }
    function message(text, type = 'danger') { $('eval-message').className = 'alert alert-' + type; $('eval-message').textContent = text; }
    async function request(path, options) {
        const response = await authenticatedFetch('http://localhost:8000/api/' + path, options);
        const data = await response.json();
        if (!response.ok) throw new Error(/schema cache|does not exist|could not find/i.test(data.detail || '')
            ? 'Falta instalar la migración 202610280008_evaluaciones.sql en Supabase.' : data.detail || 'No se pudo completar la operación.');
        return data;
    }
    function current(id) { return records.find(r => r.fecha_trabajo === loadedDate && r.id_tecnico === id); }

    const shifted = (date, days) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
    const number = n => n.toLocaleString('es-MX', { maximumFractionDigits: 1 });
    const average = rows => rows.length ? rows.reduce((sum, r) => sum + Number(r.resultado), 0) / rows.length : null;
    const percent = n => n === null ? 'Sin evaluar' : number(n) + ' %';
    const dateLabel = date => new Date(date + 'T12:00:00Z').toLocaleDateString('es-MX', { timeZone: 'UTC' });
    function matches(r) {
        return (!$('eval-filter-tech').value || String(r.id_tecnico) === $('eval-filter-tech').value);
    }
    function weekRows(w) { return records.filter(r => r.fecha_trabajo >= w.start && r.fecha_trabajo <= w.end && matches(r)); }
    function people() {
        const w = week(loadedDate);
        return technicians.filter(t => (t.estado === 'Activo' || records.some(r => r.id_tecnico === t.id_tecnico && r.fecha_trabajo >= w.start && r.fecha_trabajo <= w.end))
            && (!$('eval-filter-tech').value || String(t.id_tecnico) === $('eval-filter-tech').value));
    }
    function delta(now, previous) {
        return now === null || previous === null ? 'Sin comparación' : (now >= previous ? '+' : '') + number(now - previous) + ' pts';
    }
    function renderHistory() {
        const id = Number($('eval-history-tech').value), w = week(loadedDate);
        const rows = weekRows(w);
        const days = ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'];
        const points = Array.from({ length: 7 }, (_, i) => {
            const date = shifted(w.start, i);
            const record = rows.find(r => r.id_tecnico === id && r.fecha_trabajo === date);
            return { date, value: record ? Number(record.resultado) : null };
        });
        if (!id) { $('eval-history').innerHTML = '<p class="eval-empty">Selecciona un técnico para ver su desempeño.</p>'; return; }
        const x = i => 62 + i * 86, y = v => 225 - v * 1.8;
        let svg = '<svg viewBox="0 0 640 290" role="img" aria-label="Calificaciones diarias del técnico seleccionado en la semana consultada">';
        [0,25,50,75,100].forEach(v => { svg += '<line x1="48" x2="600" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#dce5f1"/><text x="8" y="' + (y(v) + 4) + '" fill="#617088" font-size="12">' + v + '%</text>'; });
        points.forEach((p,i) => {
            const prev = points[i-1];
            if (p.value !== null && prev && prev.value !== null) svg += '<line x1="' + x(i-1) + '" y1="' + y(prev.value) + '" x2="' + x(i) + '" y2="' + y(p.value) + '" stroke="#176bff" stroke-width="3"/>';
            if (p.value !== null) svg += '<circle cx="' + x(i) + '" cy="' + y(p.value) + '" r="6" fill="#176bff" stroke="white" stroke-width="2"/><text text-anchor="middle" x="' + x(i) + '" y="' + (y(p.value)-13) + '" font-size="13" fill="#11213b">' + percent(p.value) + '</text>';
            svg += '<text text-anchor="middle" x="' + x(i) + '" y="250" font-size="12" fill="#52637b">' + days[i] + '</text>';
            svg += '<text text-anchor="middle" x="' + x(i) + '" y="270" font-size="11" fill="#52637b">' + dateLabel(p.date).replace(/\/\d{4}$/, '') + '</text>';
        });
        const accessible = points.map((p, i) => days[i] + ' ' + dateLabel(p.date) + ': ' + percent(p.value)).join('; ');
        $('eval-history').innerHTML = svg + '</svg><p class="visually-hidden">' + esc(accessible) + '</p>' +
            (points.every(p => p.value === null) ? '<p class="eval-empty">Sin evaluaciones en esta semana.</p>' : '');
    }
    function render() {
        const w = week(loadedDate), rows = weekRows(w), prior = weekRows(week(shifted(w.start, -7)));
        const list = people();
        const daily = list;
        const active = daily.filter(t => t.estado === 'Activo'), evaluated = active.filter(t => current(t.id_tecnico)).length;
        const stats = list.map(t => ({ t, rows: rows.filter(r => r.id_tecnico === t.id_tecnico) }))
            .map(item => ({ ...item, avg: average(item.rows) }));
        const valid = stats.filter(s => s.avg !== null);
        const team = valid.length ? valid.reduce((sum, s) => sum + s.avg, 0) / valid.length : null;
        const previous = list.map(t => average(prior.filter(r => r.id_tecnico === t.id_tecnico))).filter(v => v !== null);
        const previousTeam = previous.length ? previous.reduce((a,b) => a+b,0)/previous.length : null;
        $('eval-average').textContent = percent(team);
        $('eval-comparison').textContent = delta(team, previousTeam) + ' vs. semana anterior · promedio por técnico';
        $('eval-count').textContent = evaluated + ' de ' + active.length;
        $('eval-pending').textContent = (active.length-evaluated) + ' técnicos';
        const best = valid.length ? Math.max(...valid.map(s => s.avg)) : null;
        $('eval-best').textContent = best === null ? 'Sin evaluar' : percent(best);
        $('eval-best-note').textContent = valid.filter(s => s.avg === best).map(s => s.t.nombre).join(' · ') || 'Sin evaluaciones esta semana';
        $('eval-rows').innerHTML = daily.map(t => {
            const r = current(t.id_tecnico);
            return '<tr><td><span class="eval-avatar">' + esc(t.nombre.slice(0,1)) + '</span>' + esc(t.nombre) + (t.estado !== 'Activo' ? ' (Inactivo)' : '') +
                '</td><td><strong>' + (r ? percent(Number(r.resultado)) : '—') +
                '</strong></td><td><span class="eval-pill ' + (r ? 'done' : '') + '">' + (r ? 'Evaluado' : 'Sin evaluar') +
                '</span></td><td>' + (r ? esc(new Date(r.actualizado_en).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })) : '—') +
                '</td><td><button type="button" class="btn btn-sm btn-outline-primary" data-tech="' + t.id_tecnico + '">' + (r ? 'Editar' : 'Evaluar') + '</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-activities="' + t.id_tecnico + '">Ver actividades</button></td></tr>';
        }).join('') || '<tr><td colspan="5">No hay técnicos con estos filtros.</td></tr>';
        $('eval-chart').innerHTML = stats.map(({t, rows: entries, avg}) => {
            const comparison = delta(avg, average(prior.filter(r => r.id_tecnico === t.id_tecnico)));
            return '<div class="eval-person"><div class="d-flex justify-content-between gap-2"><strong>' + esc(t.nombre) + '</strong><span>' + percent(avg) +
                '</span></div><div class="progress" role="img" aria-label="' + esc(t.nombre + ': ' + percent(avg)) + '"><div class="progress-bar" style="width:' + (avg ?? 0) +
                '%"></div></div><div class="d-flex justify-content-between gap-2 mt-1"><small>' + entries.length + ' días evaluados</small><span class="eval-delta">' + comparison + '</span></div></div>';
        }).join('') || '<p class="eval-empty">No hay técnicos con estos filtros.</p>';
        const old = $('eval-history-tech').value;
        $('eval-history-tech').innerHTML = list.map(t => '<option value="' + t.id_tecnico + '">' + esc(t.nombre) + '</option>').join('');
        if (list.some(t => String(t.id_tecnico) === old)) $('eval-history-tech').value = old;
        renderHistory();
        $('eval-export').disabled = !rows.length;
        $('eval-export-pdf').disabled = !rows.length;
    }

    function dailyExportChart(people, rows, start) {
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo generar la gráfica.');
        const colors = ['#176bff','#d94801','#00875a','#843dc4','#c51b65','#007d99','#8c6200','#424b5a'];
        ctx.font = '14px Arial';
        const legends = people.map((person, index) => {
            const values = Array.from({length:7}, (_, i) => {
                const record = rows.find(r => r.id_tecnico === person.id && r.fecha_trabajo === shifted(start,i));
                return record ? Number(record.resultado) : null;
            });
            const text = person.name + (values.every(v => v === null) ? ' (sin evaluar)' : '');
            const lines = []; let line = '';
            for (const char of text) {
                if (ctx.measureText(line + char).width > 240) { lines.push(line); line = ''; }
                line += char;
            }
            if (line) lines.push(line);
            return {values, lines, color:colors[index % colors.length], dash:index % 2 ? [7,4] : []};
        });
        const legendHeights = [];
        for (let i=0;i<legends.length;i+=3) legendHeights.push(Math.max(...legends.slice(i,i+3).map(l => l.lines.length))*18+14);
        const height = 350 + legendHeights.reduce((a,b)=>a+b,0);
        canvas.width=1840;canvas.height=height*2;ctx.scale(2,2);
        ctx.fillStyle='#ffffff';ctx.fillRect(0,0,920,height);
        ctx.fillStyle='#0b1528';ctx.font='bold 20px Arial';ctx.fillText('Comparativo diario por técnico',20,28);
        const days=['Dom.','Lun.','Mar.','Mié.','Jue.','Vie.','Sáb.'];
        const x=i=>95+i*128,y=v=>280-v*2;
        ctx.font='14px Arial';
        [0,25,50,75,100].forEach(v=>{
            ctx.strokeStyle='#dce5f1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(70,y(v));ctx.lineTo(885,y(v));ctx.stroke();
            ctx.fillStyle='#607087';ctx.textAlign='right';ctx.fillText(v+' %',60,y(v)+5);
        });
        days.forEach((day,i)=>{
            ctx.textAlign='center';ctx.fillStyle='#52637b';ctx.fillText(day,x(i),307);
            ctx.fillText(dateLabel(shifted(start,i)).replace(/\/\d{4}$/, ''),x(i),328);
        });
        legends.forEach(({values,color,dash},index)=>{
            ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.setLineDash(dash);ctx.beginPath();
            values.forEach((v,i)=>{if(v!==null){if(i && values[i-1]!==null)ctx.lineTo(x(i),y(v));else ctx.moveTo(x(i),y(v));}});
            ctx.stroke();ctx.setLineDash([]);
            values.forEach((v,i)=>{if(v!==null){
                ctx.fillStyle=color;ctx.strokeStyle='#ffffff';ctx.lineWidth=1;
                if(index%2){ctx.fillRect(x(i)-4,y(v)-4,8,8);ctx.strokeRect(x(i)-4,y(v)-4,8,8);}
                else {ctx.beginPath();ctx.arc(x(i),y(v),4.5,0,Math.PI*2);ctx.fill();ctx.stroke();}
            }});
        });
        let legendY=356;
        legends.forEach((entry,i)=>{
            const col=i%3,left=25+col*300;
            ctx.strokeStyle=entry.color;ctx.lineWidth=3;ctx.setLineDash(entry.dash);
            ctx.beginPath();ctx.moveTo(left,legendY-5);ctx.lineTo(left+30,legendY-5);ctx.stroke();ctx.setLineDash([]);
            ctx.fillStyle='#26364d';ctx.textAlign='left';ctx.font='14px Arial';
            entry.lines.forEach((line,j)=>ctx.fillText(line,left+40,legendY+j*18));
            if(col===2)legendY+=legendHeights[Math.floor(i/3)];
        });
        return {data:canvas.toDataURL('image/png'),height};
    }
    function exportWeekPdf() {
        if (busy || !loadedDate) return;
        const w = week(loadedDate), rows = weekRows(w);
        if (!rows.length) return;
        try {
            const brand = window.CampoterraReportLogo;
            if (!window.jspdf?.jsPDF || !brand?.data) throw new Error('No se pudo cargar PDF. Recarga la página.');
            const results = people().map(t => ({ id: t.id_tecnico, name: t.nombre, value: average(rows.filter(r => r.id_tecnico === t.id_tecnico)) }));
            const doc = new window.jspdf.jsPDF();
            const filter = 'Técnico: ' + $('eval-filter-tech').selectedOptions[0].text;
            const filterLines = doc.splitTextToSize(filter, 180);
            const top = 45 + filterLines.length * 4;
            function header() {
                doc.addImage(brand.data, 'PNG', 15, 10, 65, 65 / brand.ratio);
                doc.setTextColor(11, 21, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
                doc.text('Evaluaciones semanales', 90, 17);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                doc.text('Departamento de Mantenimiento', 90, 24);
                doc.setDrawColor(25, 135, 84); doc.line(15, 31, 195, 31);
                doc.text($('eval-week').textContent, 15, 37);
                doc.text(filterLines, 15, 42);
            }
            doc.setProperties({title:'Evaluaciones semanales de Campoterra',author:'Campoterra CMMS'});
            doc.autoTable({ startY: top, margin: {left:15,right:15,top,bottom:20},
                head:[['Técnico','Calificación semanal']], body:results.map(r=>[r.name,percent(r.value)]),
                theme:'striped', headStyles:{fillColor:[11,21,40]}, styles:{fontSize:10,cellPadding:3},
                columnStyles:{1:{cellWidth:55}}, didDrawPage:header });
            const chart = dailyExportChart(results,rows,w.start), chartHeight=180*chart.height/920;
            let y = doc.lastAutoTable.finalY + 10;
            if(y+chartHeight+18>277){doc.addPage();header();y=top+5;}
            doc.addImage(chart.data,'PNG',15,y,180,chartHeight);
            y+=chartHeight+5;
            const note=doc.splitTextToSize('Promedio de los días evaluados. Los días sin evaluación no cuentan como cero.',180);
            if(y+note.length*4>277){doc.addPage();header();y=top+5;}
            doc.setFontSize(9);doc.setTextColor(96,112,135);doc.text(note,15,y+4);
            const pages=doc.getNumberOfPages();
            for(let page=1;page<=pages;page++){
                doc.setPage(page);doc.setFontSize(8);doc.setTextColor(96,112,135);
                doc.text('Campoterra | Mantenimiento',15,288);
                doc.text('Página '+page+' de '+pages,195,288,{align:'right'});
            }
            doc.save('Resumen-semanal-con-grafica-'+w.start+'.pdf');
        }catch(error){message(error.message);}
    }
    async function exportWeek() {
        if (busy || !loadedDate) return;
        const rows = weekRows(week(loadedDate));
        if (!rows.length) return;
        $('eval-export').disabled = true;
        try {
            if (!window.ExcelJS || !window.CampoterraReportLogo?.data) throw new Error('No se pudo cargar la plantilla. Recarga la página.');

            const results = people().map(t => ({
                id: t.id_tecnico, name: t.nombre,
                value: average(rows.filter(r => r.id_tecnico === t.id_tecnico))
            }));
            const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Resumen semanal');
            const brand = window.CampoterraReportLogo;
            sheet.columns = [{width:42},{width:26},{width:4},{width:24},{width:24},{width:24}];
            sheet.addImage(book.addImage({base64:brand.data,extension:'png'}), {tl:{col:0,row:0},ext:{width:230,height:230/brand.ratio}});
            sheet.mergeCells('D1:F2'); sheet.getCell('D1').value = 'Calificaciones semanales';
            sheet.getCell('D1').font = {size:20,bold:true,color:{argb:'FF0B1528'}};
            sheet.getRow(1).height=28; sheet.getRow(2).height=28;
            sheet.mergeCells('A4:F4'); sheet.getCell('A4').value = $('eval-week').textContent;
            sheet.mergeCells('A5:F5'); sheet.getCell('A5').value = 'Técnico: ' + $('eval-filter-tech').selectedOptions[0].text;
            sheet.mergeCells('A6:F6'); sheet.getCell('A6').value = 'Promedio de las evaluaciones diarias registradas. Los días sin evaluar no cuentan como cero.';
            sheet.getRow(8).values = ['Técnico','Calificación semanal'];
            results.forEach(item => {
                const row=sheet.addRow([item.name,item.value === null ? 'Sin evaluar' : item.value/100]);
                row.getCell(2).numFmt='0.0%';
                row.height=32;
            });
            sheet.getRow(8).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B1528'}};});
            sheet.views=[{state:'frozen',ySplit:8}];
            sheet.eachRow(row=>{row.alignment={vertical:'middle',wrapText:true};});
            let chartRow=sheet.rowCount+3;
            sheet.mergeCells(chartRow,1,chartRow,6);
            sheet.getCell(chartRow,1).value='Desempeño diario de la semana';
            sheet.getCell(chartRow,1).font={bold:true,size:14};
            chartRow+=2;
            const chart=dailyExportChart(results,rows,week(loadedDate).start);
            sheet.addImage(book.addImage({base64:chart.data,extension:'png'}),{
                tl:{col:0,row:chartRow-1},ext:{width:920,height:chart.height}
            });
            const chartRows=Math.ceil(chart.height/20)+1;
            for(let n=chartRow;n<chartRow+chartRows;n++)sheet.getRow(n).height=15;
            chartRow+=chartRows;
            const lastRow=chartRow;
            sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:F'+lastRow};
            sheet.headerFooter.oddFooter='&LCampoterra | Mantenimiento&R Página &P de &N';
            const url=URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
            const link=document.createElement('a');link.href=url;link.download='Resumen-semanal-con-grafica-'+week(loadedDate).start+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
        } catch(e) { message(e.message); }
        finally { $('eval-export').disabled = busy || !loadedDate || !weekRows(week(loadedDate)).length; }
    }
    function actualizarExportaciones() {
        const disabled = busy || !loadedDate || !weekRows(week(loadedDate)).length;
        $('eval-export').disabled = disabled;
        $('eval-export-pdf').disabled = disabled;
    }
    function canLeave() { return !dirty || confirm('Hay cambios sin guardar. ¿Deseas descartarlos?'); }
    function close() { selected = null; dirty = false; $('eval-editor').hidden = true; }
    async function load() {
        if (busy) return;
        if (!canLeave()) { $('eval-date').value = loadedDate; return; }
        const date = $('eval-date').value;
        if (!date || date > today) { $('eval-date').value = loadedDate; message('Selecciona una fecha de trabajo que no sea futura.'); return; }
        busy = true; $('eval-filter-tech').disabled = true; $('eval-history-tech').disabled = true; $('eval-export').disabled = true; $('eval-export-pdf').disabled = true; $('eval-load').disabled = true; $('eval-date').disabled = true; close();
        $('eval-rows').innerHTML = '<tr><td colspan="5">Cargando evaluaciones…</td></tr>'; $('eval-chart').innerHTML = ''; $('eval-history').innerHTML = '';
        for (const id of ['eval-average','eval-count','eval-best','eval-pending']) $(id).textContent='—';
        $('eval-comparison').textContent='Cargando…'; $('eval-best-note').textContent='Cargando…';
        try {
            if (!window.CampoterraCloud?.enabled) throw new Error('Evaluaciones requiere la conexión con Supabase.');
            const w = week(date);
            const [ts, rs] = await Promise.all([request('tecnicos'), request(`evaluaciones?desde=${shifted(w.start, -28)}&hasta=${w.end}`)]);
            technicians = ts; records = rs; loadedDate = date;
            for (const [id, items, key, name] of [['eval-filter-tech', technicians, 'id_tecnico', 'nombre']]) {
                const old = $(id).value;
                $(id).innerHTML = '<option value="">Todos</option>' + items.map(item => '<option value="' + item[key] + '">' + esc(item[name]) + '</option>').join('');
                if (items.some(item => String(item[key]) === old)) $(id).value = old;
            }
            $('eval-week').textContent = `Semana ${w.number} de ${w.year} · ${dateLabel(w.start)} al ${dateLabel(w.end)}`;
            $('eval-message').className = 'alert d-none'; render();
        } catch (e) { loadedDate = ''; records = []; message(e.message); $('eval-rows').innerHTML = '<tr><td colspan="5">No se pudieron cargar los datos. Pulsa Consultar para reintentar.</td></tr>'; }
        finally { busy = false; actualizarExportaciones(); $('eval-filter-tech').disabled = false; $('eval-history-tech').disabled = false; $('eval-load').disabled = false; $('eval-date').disabled = false; }
    }
    function score() {
        const values = fields.map(f => Number($('grade-' + f).value));
        $('eval-score').textContent = values.every(v => Number.isInteger(v) && v >= 1 && v <= 5) ? 'Resultado: ' + values.reduce((a, b) => a + b, 0) * 5 + ' %' : 'Completa los cuatro criterios';
    }
    $('eval-rows').addEventListener('click', e => {
        const activities = e.target.closest('[data-activities]');
        if (activities && !busy) {
            window.dispatchEvent(new CustomEvent('campoterra:actividades', {detail:{date:loadedDate,tech:Number(activities.dataset.activities)}}));
            return;
        }
        const button = e.target.closest('[data-tech]'); if (!button || busy || !canLeave()) return;
        selected = technicians.find(t => t.id_tecnico === Number(button.dataset.tech));
        const r = current(selected.id_tecnico); revision = r?.revision || 0; dirty = false;
        $('eval-title').textContent = selected.nombre + ' · Trabajo del ' + loadedDate;
        $('eval-grades').innerHTML = fields.map((f, i) => `<label class="col-sm-6 col-xl-3">${labels[i]}<select required id="grade-${f}" class="form-select"><option value="">Sin calificar</option>${[1, 2, 3, 4, 5].map(v => `<option ${r?.[f] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join('');
        $('eval-notes').value = r?.observaciones || ''; $('eval-editor').hidden = false; score(); $('grade-calidad').focus();
    });
    $('eval-form').addEventListener('input', () => { dirty = true; score(); });
    $('eval-form').addEventListener('submit', async e => {
        e.preventDefault(); if (busy || !selected) return;
        const body = { id_tecnico: selected.id_tecnico, id_turno: current(selected.id_tecnico)?.id_turno ?? null, fecha_trabajo: loadedDate, revision, observaciones: $('eval-notes').value.trim() };
        fields.forEach(f => body[f] = Number($('grade-' + f).value));
        busy = true; $('eval-filter-tech').disabled = true; $('eval-history-tech').disabled = true; $('eval-export').disabled = true; $('eval-export-pdf').disabled = true; $('eval-fields').disabled = true; $('eval-load').disabled = true; $('eval-date').disabled = true;
        try {
            const saved = await request('evaluaciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            records = records.filter(r => !(r.id_tecnico === saved.id_tecnico && r.fecha_trabajo === saved.fecha_trabajo)); records.push(saved);
            close(); render(); message('Evaluación guardada. El promedio semanal se actualizó.', 'success');
        } catch (error) { message(error.message + ' Si la respuesta fue incierta, consulta la semana antes de reintentar.'); }
        finally { busy = false; actualizarExportaciones(); $('eval-filter-tech').disabled = false; $('eval-history-tech').disabled = false; $('eval-fields').disabled = false; $('eval-load').disabled = false; $('eval-date').disabled = false; }
    });
    $('eval-cancel').onclick = () => { if (canLeave()) close(); };
    $('eval-load').onclick = load; $('eval-date').onchange = load;
    for (const id of ['eval-filter-tech']) $(id).addEventListener('change', () => { if (!busy && loadedDate) render(); });
    $('eval-history-tech').onchange = () => { if (!busy && loadedDate) renderHistory(); };
    $('eval-export').onclick = exportWeek;
    $('eval-export-pdf').onclick = exportWeekPdf;
    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    const yesterday = new Date(today + 'T12:00:00Z'); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    $('eval-date').max = today; $('eval-date').value = iso(yesterday); load();
})();


