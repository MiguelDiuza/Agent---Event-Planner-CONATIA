const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const datos = JSON.parse(fs.readFileSync('docs/datos_tarifario.json', 'utf8'));
const { sedes, porAforo } = datos;

function formatoMoneda(val) {
  return '$' + Number(val).toLocaleString('es-CO');
}

// Separación según reglas del negocio
function getSeparacion(nombreSede) {
  if (nombreSede === 'Casa 4') return { texto: '$3.000.000', tipo: 'Excepción Campestre' };
  if (['Sede Sur 66 Mundo Foto', 'Sede Norte', 'Pilas Premium'].includes(nombreSede)) {
    return { texto: '$1.000.000', tipo: 'Tradicional' };
  }
  if (['Casa Christian\'s Ciudad Jardín', 'Casa 5', 'Casa 74', 'Mansión Vallano', 'Hacienda El Talismán', 'Marquez De Loyola', 'Sawa'].includes(nombreSede)) {
    return { texto: '$2.000.000', tipo: 'Campestre' };
  }
  return { texto: 'A definir en cita', tipo: 'Sin clasificar' };
}

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Tarifario y Catálogo de Sedes — Christian Sierra Event Planner</title>
  <style>
    @page {
      size: letter;
      margin: 15mm 15mm 15mm 15mm;
    }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11pt;
      line-height: 1.4;
    }
    .header {
      border-bottom: 3px solid #d97706;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header h1 {
      margin: 0;
      color: #0f172a;
      font-size: 20pt;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .header .subtitle {
      color: #d97706;
      font-size: 12pt;
      font-weight: 600;
      margin-top: 4px;
    }
    .header .meta {
      text-align: right;
      font-size: 9pt;
      color: #64748b;
    }
    .badge-pista {
      background-color: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 600;
      display: inline-block;
    }
    .badge-tipo {
      background-color: #f1f5f9;
      color: #475569;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 8pt;
      display: inline-block;
    }
    .section-title {
      font-size: 14pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 25px;
      margin-bottom: 10px;
      border-left: 4px solid #d97706;
      padding-left: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      text-align: left;
      font-size: 9.5pt;
    }
    th {
      background-color: #f8fafc;
      color: #334155;
      font-weight: 700;
    }
    tr:nth-child(even) {
      background-color: #fcfdfe;
    }
    .price-col {
      text-align: right;
      font-weight: 700;
      color: #0f172a;
    }
    .aforo-header {
      background-color: #0f172a;
      color: #ffffff;
      padding: 8px 12px;
      font-size: 11pt;
      font-weight: 700;
      border-radius: 4px 4px 0 0;
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
    }
    .page-break {
      page-break-after: always;
    }
    .footer-note {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 25px;
      padding: 10px;
      background-color: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
  </style>
</head>
<body>

  <!-- PORTADA / RESUMEN GENERAL -->
  <div class="header">
    <div>
      <h1>Christian Sierra Event Planner</h1>
      <div class="subtitle">Tarifario Oficial de Paquetes y Catálogo de Sedes</div>
    </div>
    <div class="meta">
      <strong>Vigencia:</strong> 2026<br>
      <strong>Generado:</strong> ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </div>

  <div class="section-title">1. Resumen de Salones y Valores de Separación</div>
  <p style="font-size: 9.5pt; color: #475569; margin-top: 0;">
    El negocio maneja 15 sedes exclusivas clasificadas por tipo de espacio. Tres de ellas cuentan con <strong>Pista de Cristal de Lujo Incluida</strong> en el paquete.
  </p>

  <table>
    <thead>
      <tr>
        <th style="width: 35%;">Salón / Sede</th>
        <th style="width: 25%;">Tipo de Espacio</th>
        <th style="width: 22%;">Valor de Separación</th>
        <th style="width: 18%;">Capacidad</th>
      </tr>
    </thead>
    <tbody>
      ${sedes.map(s => {
        const sep = getSeparacion(s.nombre_sede);
        const tramos = s.nombre_sede === 'Gran Salón' || s.nombre_sede === 'Valdemoro' ? '100 a 200 pers.'
          : ['Casa 4', 'Casa Christian\'s Ciudad Jardín', 'Hacienda El Talismán', 'Orquideorama', 'Pilas Premium', 'Sawa'].includes(s.nombre_sede) ? '50 a 200 pers.'
          : '50 a 150 pers.';
        return `<tr>
          <td>
            <strong>${s.nombre_sede}</strong>
            ${s.incluye_pista_cristal ? '<br><span class="badge-pista">✨ Incluye Pista de Cristal</span>' : ''}
          </td>
          <td><span class="badge-tipo">${sep.tipo}</span></td>
          <td style="font-weight: 600; color: #047857;">${sep.texto}</td>
          <td style="font-size: 9pt; color: #64748b;">${tramos}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <div class="footer-note">
    <strong>Reglas de Separación:</strong><br>
    • <strong>Salones Tradicionales:</strong> Se separan desde <strong>$1.000.000</strong>.<br>
    • <strong>Salones Campestres:</strong> Se separan desde <strong>$2.000.000</strong>.<br>
    • <strong>Casa 4 (Excepción):</strong> Se separa desde <strong>$3.000.000</strong>.<br>
    • <strong>Sin Clasificar:</strong> El valor de separación se confirma en la cita personalizada.
  </div>

  <div class="page-break"></div>

  <!-- TABLAS DETALLADAS DE PRECIOS POR AFORO (50 A 200 PERSONAS) -->
  <div class="header">
    <div>
      <h1 style="font-size: 16pt;">Tarifas por Cantidad de Personas (50 a 120 Invitados)</h1>
      <div class="subtitle" style="font-size: 10pt;">Paquetes Todo Incluido</div>
    </div>
  </div>

  <div class="grid-2">
    ${[50, 60, 70, 80, 90, 100, 110, 120].map(aforo => `
      <div>
        <div class="aforo-header">
          <span>👥 Paquete para ${aforo} Personas</span>
          <span style="font-size: 9pt; opacity: 0.9;">${(porAforo[aforo] || []).length} sedes</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Sede</th>
              <th style="text-align: right;">Precio Paquete</th>
            </tr>
          </thead>
          <tbody>
            ${(porAforo[aforo] || []).map(p => `
              <tr>
                <td>
                  ${p.nombre_sede}
                  ${p.incluye_pista_cristal ? '<span style="font-size: 7.5pt; color: #b45309;"> (Pista cristal)</span>' : ''}
                </td>
                <td class="price-col">${formatoMoneda(p.precio_total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  </div>

  <div class="page-break"></div>

  <!-- SEGUNDA PÁGINA DE AFOROS (130 A 200 PERSONAS) -->
  <div class="header">
    <div>
      <h1 style="font-size: 16pt;">Tarifas por Cantidad de Personas (130 a 200 Invitados)</h1>
      <div class="subtitle" style="font-size: 10pt;">Paquetes Todo Incluido</div>
    </div>
  </div>

  <div class="grid-2">
    ${[130, 140, 150, 160, 170, 180, 190, 200].map(aforo => `
      <div>
        <div class="aforo-header">
          <span>👥 Paquete para ${aforo} Personas</span>
          <span style="font-size: 9pt; opacity: 0.9;">${(porAforo[aforo] || []).length} sedes</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Sede</th>
              <th style="text-align: right;">Precio Paquete</th>
            </tr>
          </thead>
          <tbody>
            ${(porAforo[aforo] || []).map(p => `
              <tr>
                <td>
                  ${p.nombre_sede}
                  ${p.incluye_pista_cristal ? '<span style="font-size: 7.5pt; color: #b45309;"> (Pista cristal)</span>' : ''}
                </td>
                <td class="price-col">${formatoMoneda(p.precio_total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  </div>

</body>
</html>`;

const rutaHtml = path.resolve('docs/Tarifario_Sedes_Precios.html');
const rutaPdf = path.resolve('docs/Tarifario_Sedes_Precios_Christian_Sierra.pdf');

fs.writeFileSync(rutaHtml, html, 'utf8');
console.log('HTML generado en:', rutaHtml);

// Generar PDF con Edge
const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (fs.existsSync(edgeExe)) {
  try {
    const cmd = `"${edgeExe}" --headless --disable-gpu --run-all-compositor-stages-before-draw --print-to-pdf="${rutaPdf}" "${rutaHtml}"`;
    execSync(cmd, { stdio: 'inherit' });
    console.log('PDF generado exitosamente en:', rutaPdf);
  } catch (e) {
    console.error('Error al generar PDF con Edge:', e.message);
  }
} else {
  console.log('Edge no encontrado en ruta predeterminada, se guardó HTML listo para imprimir.');
}
