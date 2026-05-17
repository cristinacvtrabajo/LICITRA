// services/email.js — Envío de emails via Resend
// Docs: https://resend.com/docs/send-email
'use strict';

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.FROM_EMAIL || 'LICITRA <notificaciones@licitra.app>';

/**
 * Envía un email de notificación a un usuario cuando alguna de las
 * licitaciones que sigue ha cambiado en una sincronización.
 *
 * @param {string} toEmail      - Email del destinatario
 * @param {Array}  cambios      - Lista de objetos { nombre, expediente, cambios[] }
 * @param {string} fileName     - Nombre del archivo sincronizado
 */
async function enviarNotificacionSeguimiento(toEmail, cambios, fileName) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY no configurada — email omitido');
    return;
  }

  const plural = cambios.length > 1 ? 'licitaciones han cambiado' : 'licitación ha cambiado';

  const filas = cambios.map(c => {
    const detalles = c.cambios.length
      ? c.cambios.map(d => `<li style="margin:2px 0;color:#4b5563">${d}</li>`).join('')
      : '<li style="color:#6b7280">Sin cambios detectados en campos clave</li>';
    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">
          <div style="font-weight:600;color:#111827;font-size:13px">${escHtml(c.nombre)}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Exp: ${escHtml(c.expediente)}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">
          <ul style="margin:0;padding-left:16px;font-size:12px">${detalles}</ul>
        </td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

        <!-- Header -->
        <tr>
          <td style="background:#1d4ed8;padding:24px 32px">
            <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">
              LIC<span style="color:#60a5fa">·</span>I<span style="color:#60a5fa">·</span>TRA
            </span>
            <span style="color:#93c5fd;font-size:13px;margin-left:12px">Alertas de seguimiento</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 8px;font-size:15px;color:#111827;font-weight:600">
              ${cambios.length} ${plural} en tu seguimiento
            </p>
            <p style="margin:0 0 20px;font-size:13px;color:#6b7280">
              La sincronización del archivo <strong>${escHtml(fileName)}</strong> ha actualizado
              los siguientes expedientes que tienes marcados.
            </p>

            <!-- Tabla de cambios -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-size:13px">
              <thead>
                <tr style="background:#f3f4f6">
                  <th style="padding:10px 16px;text-align:left;color:#374151;font-size:11px;
                             text-transform:uppercase;letter-spacing:.5px;width:45%">Licitación</th>
                  <th style="padding:10px 16px;text-align:left;color:#374151;font-size:11px;
                             text-transform:uppercase;letter-spacing:.5px">Cambios detectados</th>
                </tr>
              </thead>
              <tbody>${filas}</tbody>
            </table>

            <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">
              Accede a LICITRA para ver el detalle completo y tomar acción.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f3f4f6;padding:16px 32px;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:11px;color:#9ca3af">
              Este email se ha enviado porque tienes licitaciones en seguimiento en LICITRA.
              Para dejar de recibir estas notificaciones, elimina el seguimiento desde la pestaña
              Recomendación de la aplicación.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to:   [toEmail],
      subject: `LICITRA · ${cambios.length} licitaci${cambios.length > 1 ? 'ones cambiadas' : 'ón cambiada'} en tu seguimiento`,
      html,
    });

    if (error) {
      console.error('[email] Resend error:', error);
    } else {
      console.log(`[email] Enviado a ${toEmail} — id: ${data?.id}`);
    }
  } catch (err) {
    console.error('[email] Error inesperado:', err.message);
  }
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { enviarNotificacionSeguimiento };
