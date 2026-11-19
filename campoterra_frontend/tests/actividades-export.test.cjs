const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(extra={}) {
 const ctx={window:{...extra},Blob,setTimeout:fn=>fn(),document:{body:{append(){}},createElement:()=>({click(){},remove(){}})},URL:{createObjectURL:b=>{ctx.blob=b;return 'blob:test';},revokeObjectURL(){}}};
 for(const file of ['report-logo.js','actividades-export.js'])new Function(...Object.keys(ctx),fs.readFileSync(path.join(__dirname,'..',file),'utf8'))(...Object.values(ctx));
 return ctx;
}
const technicians=[{id_tecnico:1,nombre:'José'},{id_tecnico:2,nombre:'Ramón'}];
const records=Array.from({length:24},(_,i)=>({id_actividad:String(i).padStart(3,'0'),id_tecnico:i%2+1,fecha_trabajo:'2026-10-20',descripcion:'=1+1',tipo:'Correctiva',estado:i%2?'Pendiente':'Realizada',observaciones:'Falta pieza\nSeguimiento'}));
test('reporte diario incluye todas las filas del día y filtra técnico sin mezclar fechas',async()=>{
 const texts=[];let saved,body,title;
 class PDF {
  setProperties(p){title=p.title;} setFontSize(){} splitTextToSize(t){return t.split('\n');}
  autoTable(o){body=o.body;o.didDrawPage();} addImage(){} setFont(){} setTextColor(){} setDrawColor(){} line(){}
  text(t){texts.push(t);} getNumberOfPages(){return 1;} setPage(){} save(n){saved=n;}
 }
 const api=setup({jspdf:{jsPDF:PDF}}).window.CampoterraActivitiesExport;
 const data=[...records,{...records[0],fecha_trabajo:'2026-10-21'}];
 const meta={start:'2026-10-20',end:'2026-10-20',daily:true};
 const report=api.prepare(data,technicians,meta);
 assert.equal(report.body.length,24);
 assert.match(report.period,/20\/10\/2026/);
 assert.equal(api.prepare(data,technicians,{...meta,tech:'2'}).body.length,12);
 await api.pdf(report);
 assert.equal(body.length,24);assert.equal(saved,'Actividades_2026-10-20.pdf');
 assert.equal(title,'Actividades diarias de Campoterra');assert.ok(texts.includes('Reporte diario'));
 assert.throws(()=>api.prepare([],technicians,meta),/ese día/);
});
test('semana 43, cambio de año y filtros independientes de la paginación',()=>{
 const api=setup().window.CampoterraActivitiesExport,w=api.weekRange(2026,43);
 assert.equal(w.start,'2026-10-18');assert.equal(w.end,'2026-10-24');
 assert.equal(api.weekRange(2027,1).start,'2026-12-27');
 assert.throws(()=>api.weekRange(2026,54),/semanas/);
 const report=api.prepare([...records,{...records[0],fecha_trabajo:'2026-10-25'}],technicians,w);
 assert.equal(report.body.length,24);assert.match(report.summary,/Realizadas: 12/);
 assert.equal(api.prepare(records,technicians,{...w,tech:'1'}).body.length,12);
 assert.throws(()=>api.prepare([],technicians,w),/No hay actividades/);
});
test('Excel semanal conserva las 24 actividades, notas, logo y texto seguro',async()=>{
 const ExcelJS=require('../vendor/exceljs-4.4.0.min.js'),ctx=setup({ExcelJS}),api=ctx.window.CampoterraActivitiesExport;
 await api.excel(api.prepare(records,technicians,api.weekRange(2026,43)));
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await ctx.blob.arrayBuffer()));
 const s=book.worksheets[0];assert.equal(s.rowCount,33);assert.equal(s.getImages().length,1);
 assert.match(s.getCell('A4').value,/Semana 43 de 2026/);assert.equal(s.getCell('C10').value,'=1+1');
 assert.equal(s.getCell('C10').type,ExcelJS.ValueType.String);assert.equal(s.getCell('F10').value,'Falta pieza\nSeguimiento');
 assert.equal(s.getCell('G9').value,'Turno');assert.equal(s.getCell('G10').value,'Sin asignar');assert.equal(s.autoFilter,'A9:G33');assert.equal(s.pageSetup.printTitlesRow,'9:9');
});

test('reporte conserva turno nocturno y fecha de inicio',()=>{
 const api=setup().window.CampoterraActivitiesExport;
 const report=api.prepare([{...records[0],turno:'Noche'}],technicians,api.weekRange(2026,43));
 assert.match(report.body[0][6],/Noche.*22:00.*06:00.*siguiente/);
 assert.equal(report.body[0][0],'20/10/2026');
});
