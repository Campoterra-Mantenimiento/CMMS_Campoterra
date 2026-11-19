/* Mínimos definidos por el encargado; no se presupone un umbral general. */
(() => {
    function status(piece) {
        if (piece.stock <= 0) return { label: 'Agotada', color: 'bg-danger', replenish: true };
        if (piece.stock_minimo == null) return { label: 'Sin mínimo configurado', color: 'bg-secondary', replenish: false };
        if (piece.stock < piece.stock_minimo) return { label: 'Existencia baja', color: 'bg-warning text-dark', replenish: true };
        return { label: 'Disponible', color: 'bg-success', replenish: false };
    }
    async function download(pieces) {
        const rows = pieces.filter(p => status(p).replenish);
        if (!rows.length) throw new Error('No hay refacciones que necesiten reabastecimiento.');
        const book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet('Reabastecimiento');
        sheet.columns = [32, 22, 24, 16, 16, 24, 28].map(width => ({ width }));
        sheet.mergeCells('C1:G2'); sheet.getCell('C1').value = 'Campoterra · Reabastecimiento';
        sheet.getCell('C1').font = { bold: true, size: 18 };
        sheet.getRow(1).height = 30; sheet.getRow(2).height = 30;
        const logo = window.CampoterraReportLogo;
        sheet.addImage(book.addImage({ base64: logo.data, extension: 'png' }), {
            tl: { col: 0, row: 0 }, ext: { width: 230, height: 230 / logo.ratio } });
        sheet.mergeCells('A3:G3'); sheet.getCell('A3').value = `Generado: ${new Date().toLocaleString('es-MX')}`;
        sheet.mergeCells('A4:G4'); sheet.getCell('A4').value = 'Cantidad sugerida para alcanzar el mínimo; no es una orden de compra.';
        sheet.getRow(6).values = ['Refacción', 'Código', 'Categoría', 'Existencia', 'Mínimo', 'Faltante al mínimo', 'Estado'];
        sheet.getRow(6).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1528' } }; });
        rows.forEach(p => sheet.addRow([String(p.nombre), String(p.codigo), String(p.categoria || ''), p.stock,
            p.stock_minimo ?? 'Sin definir', p.stock_minimo == null ? 'Definir mínimo' : Math.max(0, p.stock_minimo - p.stock), status(p).label]));
        sheet.eachRow(row => { row.alignment = { vertical: 'middle', wrapText: true }; if (row.number >= 6) row.height = 32; });
        sheet.views = [{ state: 'frozen', ySplit: 6 }]; sheet.autoFilter = `A6:G${sheet.rowCount}`;
        const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const link = document.createElement('a'); link.href = url; link.download = 'Reabastecimiento_Campoterra.xlsx';
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    window.InventoryLevels = { status, download };
})();
