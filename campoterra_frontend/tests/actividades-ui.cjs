// Ejecutar con PLAYWRIGHT_MODULE apuntando a Playwright y Edge instalado.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.join(__dirname,'..'), browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const html=fs.readFileSync(path.join(root,'evaluaciones.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link[^>]+>/g,'');
  await page.route('https://review.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://review.test/');
  await page.addStyleTag({url:'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'});
  await page.addStyleTag({path:path.join(root,'evaluaciones.css')});
  await page.addStyleTag({path:path.join(root,'responsive.css')});
  await page.evaluate(()=>{
   window.escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   window.CampoterraCloud={enabled:true};window.saved=[];window.fail=false;
   window.authenticatedFetch=async(url,opts)=>{
    if(url.includes('tecnicos'))return Response.json([{id_tecnico:1,nombre:'Marco',estado:'Activo'},{id_tecnico:2,nombre:'Ramón',estado:'Activo'}]);
    if(url.includes('evaluaciones'))return Response.json([]);
    if(opts){
     if(window.fail)return Response.json({detail:'La actividad cambió. Consulta de nuevo.'},{status:409});
     if(opts.method==='DELETE'){window.saved=window.saved.filter(r=>r.id_actividad!==url.split('/').pop());return Response.json({mensaje:'Actividad eliminada'});}
     const body=JSON.parse(opts.body),record={...body,revision:body.revision+1,creado_en:'2026-11-04T12:00:00Z'};
     window.saved=window.saved.filter(r=>r.id_actividad!==record.id_actividad);window.saved.push(record);return Response.json(record);
    }
    const params=new URL(url).searchParams;
    return Response.json(window.saved.filter(r=>r.fecha_trabajo>=params.get('desde')&&r.fecha_trabajo<=params.get('hasta')));
   };
  });
  await page.addScriptTag({path:path.join(root,'actividades-export.js')});
  await page.addScriptTag({path:path.join(root,'actividades.js')});
  await page.addScriptTag({path:path.join(root,'evaluaciones.js')});
  await page.addScriptTag({path:path.join(root,'responsive.js')});
  await page.waitForFunction(()=>!document.getElementById('act-new').disabled);
  await page.locator('#act-new').click();await page.locator('#act-shift').selectOption('Noche');await page.locator('#act-assignee').selectOption('1');
  await page.locator('#act-description').fill('Revisar bomba <img src=x onerror=alert(1)>');
  await page.locator('#act-form button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('act-form').hidden);
  assert.equal(await page.locator('#act-rows img').count(),0);
  await page.locator('[data-activity]:not([data-quick])').click();await page.locator('input[name=act-result][value="No realizada"]').check();
  await page.locator('#act-form button[type=submit]').click();
  assert.equal(await page.locator('#act-notes').evaluate(e=>e.validity.valueMissing),true);
  await page.locator('#act-notes').fill('Faltó refacción');
  await page.locator('#act-form button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('act-form').hidden);
  assert.match(await page.locator('#act-rows').textContent(),/No realizada/);
  await page.locator('[data-activity]:not([data-quick])').click();await page.locator('input[name=act-result][value="Realizada"]').check();
  await page.evaluate(()=>window.fail=true);await page.locator('#act-form button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('act-message').textContent.includes('cambió'));
  assert.equal(await page.locator('#act-fields').isDisabled(),false);
  page.on('dialog',d=>d.accept());await page.locator('#act-cancel').click();await page.evaluate(()=>window.fail=false);
  await page.locator('#act-new').click();await page.locator('#act-shift').selectOption('Noche');await page.locator('#act-assignee').selectOption('2');
  await page.locator('#act-type').selectOption('Emergente');await page.locator('#act-description').fill('Atender paro de banda');
  await page.locator('#act-form button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('act-form').hidden);
  assert.match(await page.locator('#act-summary').textContent(),/1 emergentes/);
  await page.locator('#act-tech').selectOption('1');await page.locator('#act-period').selectOption('semana');await page.locator('#act-load').click();
  await page.waitForFunction(()=>document.getElementById('act-summary').textContent.startsWith('1 actividades'));
  await page.locator('#tab-grades').click();
  await page.locator('[data-activities="2"]').click();
  await page.waitForFunction(()=>document.getElementById('act-range').textContent.includes('Ramón'));
  assert.equal(await page.locator('#act-period').inputValue(),'dia');
  await page.locator('#act-tech').selectOption('');await page.locator('#act-period').selectOption('semana');await page.locator('#act-load').click();
  await page.waitForFunction(()=>document.getElementById('act-summary').textContent.startsWith('2 actividades'));
  await page.locator('#act-search').fill('banda');
  assert.equal(await page.locator('#act-total').textContent(),'1');
  await page.locator('[data-quick="Realizada"]').click();
  await page.waitForFunction(()=>document.getElementById('act-form').hidden);
  assert.equal(await page.locator('#act-done').textContent(),'1');
  await page.locator('#act-search').fill('');
  await page.locator('#act-new').click();await page.locator('#act-shift').selectOption('Noche');await page.locator('#act-assignee').selectOption('1');
  await page.locator('#act-description').fill('Limpiar equipo');await page.locator('#act-another').check();
  await page.locator('#act-form').screenshot({path:path.join(root,'../tmp/actividades-form.png')});
  await page.locator('#act-form button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('act-description').value==='');
  assert.equal(await page.locator('#act-assignee').inputValue(),'1');
  assert.equal(await page.locator('#act-shift').inputValue(),'Noche');
  assert.equal(await page.locator('#act-form').isVisible(),true);
  await page.locator('#act-cancel').click();
  page.removeAllListeners('dialog');
  page.once('dialog',d=>d.dismiss());await page.locator('[data-delete]').first().click();
  assert.equal(await page.locator('[data-delete]').count(),3);
  await page.evaluate(()=>window.fail=true);
  page.once('dialog',d=>d.accept());await page.locator('[data-delete]').first().click();
  await page.waitForFunction(()=>!document.getElementById('act-load').disabled);
  assert.equal(await page.locator('[data-delete]').count(),3);
  await page.evaluate(()=>window.fail=false);
  page.once('dialog',d=>d.accept());await page.locator('[data-delete]').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-delete]').length===2);
  assert.equal(await page.locator('#act-total').textContent(),'2');
  await page.addScriptTag({path:path.join(root,'vendor/exceljs-4.4.0.min.js')});
  await page.addScriptTag({path:path.join(root,'vendor/jspdf-2.5.1.umd.min.js')});
  await page.addScriptTag({path:path.join(root,'vendor/jspdf-autotable-3.8.2.min.js')});
  await page.addScriptTag({path:path.join(root,'report-logo.js')});
  await page.evaluate(()=>{
   window.saved.push(...Array.from({length:24},(_,i)=>({id_actividad:'export-'+i,id_tecnico:i%2+1,fecha_trabajo:'2026-10-20',descripcion:'Actividad semanal '+(i+1),tipo:'Preventiva',estado:i%2?'Pendiente':'Realizada',observaciones:'Revisión del equipo y registro de resultados.',creado_en:'2026-10-20T12:00:00Z',revision:1})));
  });
  await page.locator('#act-report-year').fill('2026');await page.locator('#act-report-week').fill('43');
  await page.locator('#act-search').fill('no coincide');
  for(const type of ['pdf','excel']) {
   const download=page.waitForEvent('download');await page.locator('#act-export-'+type).click();
   const file=await download;assert.match(file.suggestedFilename(),/Actividades_2026_Semana_43/);
   await file.saveAs(path.join(root,'../tmp/actividades-semana43.'+(type==='excel'?'xlsx':'pdf')));
  }
  await page.locator('#act-search').fill('');
  await page.locator('#actividades-panel').screenshot({path:path.join(root,'../tmp/actividades-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#actividades-panel').screenshot({path:path.join(root,'../tmp/actividades-mobile.png')});
  assert.deepEqual(errors,[]);console.log('Actividades: alta, edición, emergentes, validación, conflicto, filtros, enlace de evaluación y móvil OK');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
