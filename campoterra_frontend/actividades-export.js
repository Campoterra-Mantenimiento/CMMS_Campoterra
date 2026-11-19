/* Reporte de actividades asignadas; no modifica las evaluaciones ni las bitácoras. */
(() => {
    const headers = ['Fecha', 'Técnico', 'Actividad', 'Tipo', 'Resultado', 'Observaciones', 'Turno'];
    const dateLabel = value => new Date(value + 'T12:00:00Z').toLocaleDateString('es-MX', {timeZone:'UTC'});
    function weekRange(year, week) {
        if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(week) || week < 1)
            throw new Error('Selecciona un año entre 2000 y 2100 y una semana válida.');
        const first = new Date(Date.UTC(year,0,1,12)); first.setUTCDate(first.getUTCDate()-first.getUTCDay());
        const max = Math.floor((Date.UTC(year,11,31,12)-first.getTime())/604800000)+1;
        if (week > max) throw new Error(`El año ${year} tiene ${max} semanas en este calendario.`);
        const start = new Date(first); start.setUTCDate(start.getUTCDate()+(week-1)*7);
        const end = new Date(start); end.setUTCDate(end.getUTCDate()+6);
        return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),year,week};
    }
    function prepare(records, technicians, meta) {
        const names = new Map(technicians.map(t=>[t.id_tecnico,t.nombre]));
        const rows = records.filter(r=>r.fecha_trabajo>=meta.start && r.fecha_trabajo<=meta.end && (!meta.tech || String(r.id_tecnico)===String(meta.tech)))
            .sort((a,b)=>a.fecha_trabajo.localeCompare(b.fecha_trabajo) || (names.get(a.id_tecnico)||'').localeCompare(names.get(b.id_tecnico)||'','es') || a.id_actividad.localeCompare(b.id_actividad));
        if (!rows.length) throw new Error('No hay actividades guardadas para ' + (meta.daily ? 'ese día' : 'esa semana') + ' y técnico.');
        return {
            daily: !!meta.daily,
            body:rows.map(r=>[dateLabel(r.fecha_trabajo),names.get(r.id_tecnico)||'Técnico no disponible',r.descripcion,r.tipo,r.estado,r.observaciones||'—',({Día:'Día (06:00–14:00)',Tarde:'Tarde (14:00–22:00)',Noche:'Noche (22:00–06:00 del día siguiente)'})[r.turno]||'Sin asignar']),
            period:meta.daily ? `Fecha de las actividades: ${dateLabel(meta.start)}` : `Semana ${meta.week} de ${meta.year} · ${dateLabel(meta.start)} al ${dateLabel(meta.end)}`,
            filter:'Técnico: '+(meta.tech ? names.get(Number(meta.tech))||'No disponible' : 'Todos'),
            summary:`Total: ${rows.length} | Realizadas: ${rows.filter(r=>r.estado==='Realizada').length} | Pendientes: ${rows.filter(r=>r.estado==='Pendiente').length} | No realizadas: ${rows.filter(r=>r.estado==='No realizada').length}`,
            filename:meta.daily ? `Actividades_${meta.start}` : `Actividades_${meta.year}_Semana_${String(meta.week).padStart(2,'0')}`,
            generated:new Date().toLocaleString('es-MX',{timeZone:'America/Mexico_City'})
        };
    }
    function dependencies(kind) {
        const brand=window.CampoterraReportLogo;
        if (!brand?.data || !brand.ratio) throw new Error('No se pudo cargar el logo. Recarga la página.');
        if (kind==='excel' && !window.ExcelJS || kind==='pdf' && !window.jspdf?.jsPDF) throw new Error('No se pudo cargar la herramienta de descarga. Recarga la página.');
        return brand;
    }
    async function excel(report) {
        const brand=dependencies('excel'), book=new window.ExcelJS.Workbook();
        book.creator='Campoterra CMMS';book.created=new Date();
        const sheet=book.addWorksheet('Actividades semanales');
        const widths=[15,25,60,18,20,65,32];sheet.columns=widths.map(width=>({width}));
        [1,2,3].forEach(n=>sheet.getRow(n).height=26);
        sheet.addImage(book.addImage({base64:brand.data,extension:'png'}),{tl:{col:0,row:0},ext:{width:260,height:260/brand.ratio}});
        sheet.mergeCells('C1:G2');sheet.getCell('C1').value='Actividades de mantenimiento';
        sheet.getCell('C1').font={bold:true,size:20,color:{argb:'FF0B1528'}};
        sheet.mergeCells('C3:G3');sheet.getCell('C3').value='Reporte semanal · Campoterra';
        [report.period,report.filter,report.summary,`Generado: ${report.generated} · Solo actividades guardadas`].forEach((text,i)=>{
            sheet.mergeCells(i+4,1,i+4,7);sheet.getCell(i+4,1).value=text;sheet.getRow(i+4).height=30;
        });
        sheet.getRow(9).values=headers;sheet.getRow(9).height=28;
        sheet.getRow(9).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B1528'}};});
        report.body.forEach((values,i)=>{
            const row=sheet.addRow(values);
            row.height=Math.min(409,Math.max(32,...values.map((v,j)=>String(v).split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/(widths[j]-3))),0)*15)));
            row.eachCell(c=>{c.font={size:11};if(i%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F5F4'}};});
        });
        sheet.eachRow(row=>row.alignment={wrapText:true,vertical:'top'});
        sheet.autoFilter=`A9:G${sheet.rowCount}`;sheet.views=[{state:'frozen',ySplit:9}];
        sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'9:9',printArea:`A1:G${sheet.rowCount}`};
        sheet.headerFooter.oddFooter='&LCampoterra | Mantenimiento&R Página &P de &N';
        const url=URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
        const link=document.createElement('a');link.href=url;link.download=report.filename+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }
    async function pdf(report) {
        const brand=dependencies('pdf'),doc=new window.jspdf.jsPDF({orientation:'landscape'});
        if(!doc.autoTable)throw new Error('No se pudo cargar la tabla PDF. Recarga la página.');
        doc.setProperties({title:report.daily ? 'Actividades diarias de Campoterra' : 'Actividades semanales de Campoterra',author:'Campoterra CMMS'});
        doc.setFontSize(9);
        const info=doc.splitTextToSize([report.period,report.filter,report.summary].join('\n'),269);
        const top=37+info.length*4;
        doc.autoTable({startY:top,margin:{top,bottom:18,left:14,right:14},head:[headers],body:report.body,
            theme:'striped',styles:{fontSize:8,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[11,21,40]},
            columnStyles:{0:{cellWidth:22},1:{cellWidth:28},2:{cellWidth:61},3:{cellWidth:23},4:{cellWidth:26},5:{cellWidth:70},6:{cellWidth:39}},
            didDrawPage:()=>{
                doc.addImage(brand.data,'PNG',14,7,75,75/brand.ratio);
                doc.setFont('helvetica','bold');doc.setFontSize(17);doc.setTextColor(11,21,40);doc.text('Actividades de mantenimiento',102,16);
                doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(report.daily ? 'Reporte diario' : 'Reporte semanal',102,23);
                doc.setDrawColor(25,135,84);doc.line(14,30,283,30);doc.setFontSize(9);doc.text(info,14,35);
            }});
        const pages=doc.getNumberOfPages();
        for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(90);doc.text(`Generado: ${report.generated} | Actividades: ${report.body.length}`,14,202);doc.text(`Página ${i} de ${pages}`,283,202,{align:'right'});}
        doc.save(report.filename+'.pdf');
    }
    window.CampoterraActivitiesExport={weekRange,prepare,excel,pdf};
})();
