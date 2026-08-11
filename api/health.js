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

const DEPLOY_VERSION = '2026-08-11-fix-search-batch-commit-v2';

module.exports = async function (req, res) {
  const report = {
    waktu: new Date().toISOString(),
    deployVersion: DEPLOY_VERSION,
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
  for (const mod of ['google-auth', 'firestore', 'sheets', 'settings', 'registration', 'handler']) {
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

  // 7b) Uji listDocs (dipakai Perbaikan Pencarian Nama) — baca 1 dokumen pendaftaran
  try {
    const { listDocs } = require('../lib/firestore');
    const { documents, nextPageToken } = await listDocs('pendaftaran', { pageSize: 1 });
    const firstId = documents && documents[0] ? String(documents[0].name).split('/').pop() : '-';
    report.listDocs = 'OK (1 dokumen: ' + firstId + ', nextPageToken: ' + (nextPageToken ? 'ada' : 'tidak ada') + ')';
  } catch (e) {
    report.listDocs = 'ERROR: ' + (e.message || e);
  }

  // 7c) Uji endpoint commit Firestore dengan commit KOSONG (tidak menulis apa pun)
  //     — membuktikan URL :commit + auth berfungsi (dipakai Perbaikan Pencarian Nama).
  try {
    const { commitWrites } = require('../lib/firestore');
    const r = await commitWrites([]);
    report.commitWrites = 'OK (commitTime: ' + (r.commitTime || '-') + ')';
  } catch (e) {
    report.commitWrites = 'ERROR: ' + (e.message || e);
  }

  // 7) Simulasi pemanggilan getNotificationSettings PERSIS seperti endpoint aslinya
  //    (melewati lib/handler.js) — untuk meniru perilaku /api/getNotificationSettings.
  try {
    const { handler } = require('../lib/handler');
    const { getNotificationSettings } = require('../lib/settings');
    const fn = handler(() => getNotificationSettings());
    let statusCode = null;
    let bodyJson = null;
    const fakeRes = {
      status: function (code) { statusCode = code; return fakeRes; },
      json: function (body) { bodyJson = body; return fakeRes; }
    };
    await fn({ body: [] }, fakeRes);
    report.handlerInvocation = 'OK (HTTP ' + statusCode + ', data: ' + JSON.stringify(bodyJson).slice(0, 150) + ')';
  } catch (e) {
    report.handlerInvocation = 'ERROR: ' + (e.message || e);
  }

  res.status(200).json(report);
};
