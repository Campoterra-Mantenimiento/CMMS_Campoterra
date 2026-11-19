const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('Excel real conserva logo, datos, filtros y formato tras reabrir el archivo', async () => {
    const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
    let blob; let download; let clicked = false;
    const ctx = { window: { ExcelJS }, ExcelJS, Blob,
        URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} },
        setTimeout: fn => fn(),
        document: { body: { appendChild() {} }, createElement(tag) {
            assert.equal(tag, 'a');
            return { set download(value) { download = value; }, click() { clicked = true; }, remove() {} };
        } } };
    for (const file of ['report-logo.js', 'report-export.js']) {
        new Function(...Object.keys(ctx), fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))(...Object.values(ctx));
    }
    await ctx.window.CampoterraExport.excel([
        { id_bitacora: 7, nombre_area: 'Área fría', nombre_equipo: 'Bomba', nombre_tecnico: 'José',
          tipo_mantenimiento: 'Preventivo', descripcion: '=1+1', detalles_repuestos: 'Rodamiento x 2' },
        { id_bitacora: 8, descripcion: 'Revisión\nSegunda línea' }
    ], { period: 'Octubre 2026', filters: 'Tipo: Todos', generated: '09/10/2026', filename: 'Prueba' });
    assert.equal(clicked, true); assert.equal(download, 'Prueba.xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await blob.arrayBuffer()));
    const sheet = book.getWorksheet('Mantenimiento');
    assert.equal(sheet.getCell('D1').value, 'Reporte de actividades');
    assert.equal(sheet.getCell('A4').value, 'Octubre 2026');
    assert.equal(sheet.getCell('A5').value, 'Tipo: Todos');
    assert.equal(sheet.getCell('C9').value, 'Área fría');
    assert.equal(sheet.getCell('G9').value, '=1+1');
    assert.equal(sheet.getCell('G9').type, ExcelJS.ValueType.String);
    assert.equal(sheet.getCell('H9').value, 'Rodamiento x 2');
    assert.equal(sheet.getCell('G10').value, 'Revisión\nSegunda línea');
    assert.equal(sheet.rowCount, 10);
    assert.equal(sheet.autoFilter, 'A8:H10');
    assert.equal(sheet.views[0].ySplit, 8);
    assert.equal(sheet.pageSetup.orientation, 'landscape');
    assert.equal(sheet.getCell('A8').font.bold, true);
    assert.equal(sheet.getCell('G9').alignment.wrapText, true);
    const image = sheet.getImages()[0];
    assert.ok(image);
    assert.deepEqual(Buffer.from(book.getImage(image.imageId).buffer), fs.readFileSync(path.join(__dirname, '../report-logo.png')));
});

test('PDF conserva registros, refacciones y filtros y numera todas las páginas', async () => {
    let options; const texts = []; const pages = []; let saved;
    const doc = { setProperties() {}, setFontSize() {}, splitTextToSize: s => [s],
        autoTable(o) { options = o; o.didDrawPage(); }, addImage() {}, setTextColor() {}, setFont() {},
        text: s => texts.push(s), setDrawColor() {}, line() {}, getNumberOfPages: () => 2,
        setPage: p => pages.push(p), save: name => saved = name };
    const ctx = { window: { jspdf: { jsPDF: function () { return doc; } } },
        document: { createElement: () => { throw new Error('No debe usar canvas ni cargar imágenes externas'); } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../report-logo.js'), 'utf8'), ctx);
    assert.deepEqual(Buffer.from(ctx.window.CampoterraReportLogo.data.split(',')[1], 'base64'),
        fs.readFileSync(path.join(__dirname, '../report-logo.png')));
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../report-export.js'), 'utf8'), ctx);
    await ctx.window.CampoterraExport.pdf([{ id_bitacora: 3, descripcion: 'Revisión', detalles_repuestos: 'Rodamiento x 2' }],
        { period: 'Octubre 2026', filters: 'Tipo: Preventivo', generated: '09/10/2026', filename: 'Prueba' });
    assert.equal(options.body[0][7], 'Rodamiento x 2');
    assert.equal(options.head[0].length, 8);
    assert.ok(texts.flat().includes('Octubre 2026'));
    assert.ok(texts.flat().includes('Tipo: Preventivo'));
    assert.deepEqual(pages, [1, 2]);
    assert.ok(texts.includes('Página 2 de 2'));
    assert.equal(saved, 'Prueba.pdf');
});
