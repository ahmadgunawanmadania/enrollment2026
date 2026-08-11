/**
 * /api/health — endpoint diagnostik (GET).
 *
 * Tidak memakai lib/handler.js dan mem-require semua modul SECARA LAZY
 * (di dalam fungsi, dengan try/catch), supaya endpoint ini tetap bisa
 * menjawab JSON walau ada modul/dependensi yang rusak — berguna saat
 * fungsi lain gagal dengan HTTP 500 yang bodinya bukan JSON.
 *
 * Aman dibuka langsung di browser: https://<app>.vercel.app/api/health
 */

module.exports = async function (req, res) {
  const report = {
    waktu: new Date().toISOString(),
    node: process.version,
    environment: process.env.NODE_ENV || '(tidak diset)'
  };

  // 1) Dependensi npm
  report.dependencies = {};
  for (const dep of ['jsonwebtoken', 'nodemailer']) {
    try {
      require(dep);
      report.dependencies[dep] = 'OK';
    } catch (e) {
      report.dependencies[dep] = 'MISSING/ERROR: ' + (e.message || e);
    }
  }

  // 2) Modul lib (lazy require — tidak boleh mematikan endpoint ini)
  report.libModules = {};
  for (const mod of ['google-auth', 'firestore', 'sheets', 'settings', 'registration']) {
    try {
      require('../lib/' + mod);
      report.libModules[mod] = 'OK';
    } catch (e) {
      report.libModules[mod] = 'LOAD ERROR: ' + (e.message || e);
    }
  }

  // 3) Env vars (status saja — nilai tidak ditampilkan)
  const envKeys = [
    'GOOGLE_PROJECT_ID',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'SPREADSHEET_ID',
    'SMTP_HOST',
    'ADMIN_EMAIL'
  ];
  report.env = {};
  for (const key of envKeys) {
    const v = process.env[key];
    report.env[key] = v && String(v).trim() ? 'terisi' : 'KOSONG';
  }

  // 4) Uji access token (nilai token tidak ditampilkan)
  try {
    const { getAccessToken } = require('../lib/google-auth');
    await getAccessToken();
    report.accessToken = 'OK';
  } catch (e) {
    report.accessToken = 'ERROR: ' + (e.message || e);
  }

  // 5) Uji Firestore (dokumen settings/notifications)
  try {
    const { getDoc } = require('../lib/firestore');
    const doc = await getDoc('settings', 'notifications');
    report.firestore = doc ? 'OK (dokumen ditemukan)' : 'OK (dokumen belum ada)';
  } catch (e) {
    report.firestore = 'ERROR: ' + (e.message || e);
  }

  // 6) Uji Google Sheets (baca header Master_Data)
  try {
    const { readSheet } = require('../lib/sheets');
    const { headers } = await readSheet('Master_Data');
    report.sheets = 'OK (kolom: ' + String(headers.join(', ')).slice(0, 300) + ')';
  } catch (e) {
    report.sheets = 'ERROR: ' + (e.message || e);
  }

  res.status(200).json(report);
};
