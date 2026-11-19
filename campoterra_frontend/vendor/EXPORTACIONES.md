# Librerías de exportación

Copias locales de las mismas versiones utilizadas anteriormente por Reportes:

- ExcelJS 4.4.0: https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js
  Licencia MIT en exceljs-LICENSE.txt.
- jsPDF 2.5.1: https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
  Aviso y licencia incluidos en el encabezado del archivo.
- AutoTable 3.8.2: https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js
  Aviso MIT incluido en el archivo.

Conservar estos archivos al publicar. No necesitan descargarse del CDN durante
la exportación. Esto no convierte el dashboard en una aplicación sin conexión:
Supabase y otros recursos de interfaz todavía requieren red.

Pruebas: `node --test campoterra_frontend/tests/report-export.test.cjs`
desde la raíz del repositorio. La prueba Excel genera y reabre un XLSX usando
la librería distribuida, comprueba logo, contenido, filtros, estilos y que
texto comenzando con `=` permanezca como texto. La prueba PDF verifica el
contrato de exportación con un doble de prueba; no es una revisión visual.
