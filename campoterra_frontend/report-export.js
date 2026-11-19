/* Plantilla compartida de exportación institucional. */
(() => {
    const headers = ['Folio', 'Fecha', 'Área', 'Máquina', 'Técnico', 'Tipo', 'Descripción', 'Refacciones utilizadas'];
    const rows = records => records.map(b => [String(b.id_bitacora ?? ''),
        b.fecha_registro ? new Date(b.fecha_registro).toLocaleString('es-MX') : 'Sin fecha',
        b.nombre_area || 'Sin área', b.nombre_equipo || 'Sin maquinaria', b.nombre_tecnico || '',
        b.tipo_mantenimiento || '', b.descripcion || '', b.detalles_repuestos || 'Sin refacciones']);
    async function logo() {
        const brand = window.CampoterraReportLogo;
        if (!brand?.data || !brand.ratio) throw new Error('No se pudo cargar el logo. Recarga la página e inténtalo de nuevo.');
        return brand;
    }
    async function excel(records, meta) {
        if (!window.ExcelJS) throw new Error('No se pudo cargar Excel. Revisa tu conexión y vuelve a intentarlo.');
        const brand = await logo();
        const book = new ExcelJS.Workbook();
        book.creator = 'Campoterra CMMS'; book.created = new Date();
        const sheet = book.addWorksheet('Mantenimiento', { views: [{ state: 'frozen', ySplit: 8 }],
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
        const widths = [12, 23, 25, 28, 25, 18, 60, 45];
        sheet.columns = widths.map(width => ({ width }));
        sheet.getRow(1).height = 26; sheet.getRow(2).height = 26; sheet.getRow(3).height = 26;
        sheet.mergeCells('D1:H2'); sheet.getCell('D1').value = 'Reporte de actividades';
        sheet.getCell('D1').font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF0B1528' } };
        sheet.getCell('D1').alignment = { vertical: 'middle' };
        sheet.mergeCells('D3:H3'); sheet.getCell('D3').value = 'Departamento de Mantenimiento';
        sheet.addImage(book.addImage({ base64: brand.data, extension: 'png' }), {
            tl: { col: 0.1, row: 0.2 }, ext: { width: 300, height: 300 / brand.ratio } });
        const metadata = [meta.period, meta.filters, `Generado: ${meta.generated} | Registros: ${records.length}`];
        metadata.forEach((value, i) => {
            sheet.mergeCells(i + 4, 1, i + 4, 8);
            sheet.getCell(i + 4, 1).value = value;
            sheet.getRow(i + 4).height = 30;
            sheet.getCell(i + 4, 1).alignment = { wrapText: true, vertical: 'middle' };
        });
        sheet.getRow(8).values = headers; sheet.getRow(8).height = 28;
        sheet.getRow(8).eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1528' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { vertical: 'middle', wrapText: true };
        });
        rows(records).forEach((values, index) => {
            const row = sheet.addRow(values);
            row.height = Math.min(409, Math.max(32, ...values.map((v, i) =>
                String(v).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (widths[i] - 3))), 0) * 15)));
            row.eachCell(cell => {
                cell.font = { name: 'Calibri', size: 11 };
                cell.alignment = { vertical: 'top', wrapText: true };
                if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5F4' } };
            });
        });
        sheet.autoFilter = `A8:H${sheet.rowCount}`;
        sheet.pageSetup.printTitlesRow = '8:8'; sheet.pageSetup.printArea = `A1:H${sheet.rowCount}`;
        sheet.headerFooter.oddFooter = '&LCampoterra | Mantenimiento&R Página &P de &N';
        const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const link = document.createElement('a'); link.href = url; link.download = `${meta.filename}.xlsx`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    async function pdf(records, meta) {
        if (!window.jspdf?.jsPDF) throw new Error('No se pudo cargar PDF. Revisa tu conexión y vuelve a intentarlo.');
        const brand = await logo();
        const doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
        if (!doc.autoTable) throw new Error('No se pudo cargar la tabla PDF. Recarga la página.');
        doc.setProperties({ title: 'Campoterra - Reporte de mantenimiento', author: 'Campoterra CMMS' });
        doc.setFontSize(9);
        const periodLines = doc.splitTextToSize(meta.period, 265);
        const filterLines = doc.splitTextToSize(meta.filters, 265);
        const tableTop = 40 + (periodLines.length + filterLines.length) * 4;
        doc.autoTable({ startY: tableTop, margin: { top: tableTop, bottom: 18, left: 14, right: 14 },
            head: [headers], body: rows(records), theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [11, 21, 40] }, alternateRowStyles: { fillColor: [240, 245, 244] },
            columnStyles: { 0: { cellWidth: 13 }, 1: { cellWidth: 28 }, 2: { cellWidth: 28 },
                3: { cellWidth: 30 }, 4: { cellWidth: 29 }, 5: { cellWidth: 24 }, 6: { cellWidth: 68 }, 7: { cellWidth: 49 } },
            didDrawPage: () => {
                doc.addImage(brand.data, 'PNG', 14, 7, 75, 75 / brand.ratio);
                doc.setTextColor(11, 21, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
                doc.text('Reporte de actividades', 102, 16);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
                doc.text('Departamento de Mantenimiento', 102, 23);
                doc.setDrawColor(25, 135, 84); doc.line(14, 30, 283, 30);
                doc.setFontSize(9); doc.text(periodLines, 14, 35);
                doc.text(filterLines, 14, 35 + periodLines.length * 4);
            } });
        const pages = doc.getNumberOfPages();
        for (let p = 1; p <= pages; p++) {
            doc.setPage(p); doc.setFontSize(8); doc.setTextColor(90);
            doc.text(`Generado: ${meta.generated} | Registros: ${records.length}`, 14, 202);
            doc.text(`Página ${p} de ${pages}`, 283, 202, { align: 'right' });
        }
        doc.save(`${meta.filename}.pdf`);
    }
    window.CampoterraExport = { excel, pdf };
})();
