const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('mínimos distingue agotada, sin configurar, límite y existencia baja', () => {
    const context = { window: {} }; vm.createContext(context);
    vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../inventory-levels.js'), 'utf8'), context);
    const status = context.window.InventoryLevels.status;
    assert.equal(status({ stock: 0 }).replenish, true);
    assert.equal(status({ stock: 2 }).label, 'Sin mínimo configurado');
    assert.equal(status({ stock: 2, stock_minimo: 5 }).replenish, true);
    assert.equal(status({ stock: 5, stock_minimo: 5 }).label, 'Disponible');
    assert.equal(status({ stock: 1, stock_minimo: 0 }).replenish, false);
    assert.equal(status({ stock: 0, stock_minimo: 0 }).label, 'Agotada');
});
test('lista Excel contiene solo faltantes, logo y cantidades correctas', async () => {
    const ExcelJS = require('../vendor/exceljs-4.4.0.min.js'); let blob;
    const ctx = { window: {}, ExcelJS, Blob, setTimeout: fn => fn(),
        URL: { createObjectURL(b) { blob = b; return 'blob:test'; }, revokeObjectURL() {} },
        document: { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) } };
    for (const file of ['report-logo.js', 'inventory-levels.js']) {
        new Function(...Object.keys(ctx), fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8'))(...Object.values(ctx));
    }
    await ctx.window.InventoryLevels.download([
        { nombre: '=1+1', codigo: 'R1', stock: 2, stock_minimo: 5 },
        { nombre: 'Agotada', codigo: 'R2', stock: 0, stock_minimo: null },
        { nombre: 'Suficiente', stock: 5, stock_minimo: 5 }
    ]);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await blob.arrayBuffer()));
    const sheet = book.worksheets[0];
    assert.equal(sheet.rowCount, 8); assert.equal(sheet.getCell('F7').value, 3);
    assert.equal(sheet.getCell('F8').value, 'Definir mínimo');
    assert.equal(sheet.getCell('A7').type, ExcelJS.ValueType.String);
    assert.equal(sheet.getImages().length, 1);
});
