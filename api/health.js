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

const DEPLOY_VERSION = '2026-08-11-email-diagnostic-v6';

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
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'EMAIL_FROM',
    'EMAIL_NAME',
    'NOTIFICATION_EMAILS',
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

  // 8) Jalankan logika Perbaikan Pencarian Nama PERSIS seperti endpoint aslinya
  //    (halaman pertama, 150 dokumen). Jika ada dokumen yang belum punya field
  //    lowercase, field itu akan diisi — ini perilaku fitur yang memang diinginkan.
  //    Jika logikanya error, pesannya terlihat di sini (bukan FUNCTION_INVOCATION_FAILED).
  try {
    const { updatePendaftaranSearchField } = require('../lib/registration');
    const result = await updatePendaftaranSearchField(null);
    report.updateSearchField = 'OK: ' + JSON.stringify(result).slice(0, 250);
  } catch (e) {
    report.updateSearchField = 'ERROR: ' + (e.message || e);
  }

  // 9) Muat dan jalankan MODUL ENDPOINT updatePendaftaranSearchField PERSIS
  //    (termasuk lib/handler.js) — untuk meniru /api/updatePendaftaranSearchField.
  //    Jika file endpoint di deployment ini rusak (mis. SyntaxError), terlihat di sini.
  try {
    const endpoint = require('./updatePendaftaranSearchField');
    let statusCode = null;
    let bodyJson = null;
    const fakeRes = {
      status: function (code) { statusCode = code; return fakeRes; },
      json: function (body) { bodyJson = body; return fakeRes; }
    };
    await endpoint({ body: [null] }, fakeRes);
    report.endpointUpdateSearch = 'OK (HTTP ' + statusCode + ', body: ' + JSON.stringify(bodyJson).slice(0, 250) + ')';
  } catch (e) {
    report.endpointUpdateSearch = 'ERROR: ' + (e && e.stack ? e.stack : e);
  }

  // 10) Muat SEMUA modul endpoint api/*.js — mendeteksi file yang rusak/terpotong
  //     (mis. baris import handler hilang seperti yang terjadi pada
  //     updatePendaftaranSearchField).
  report.apiModules = {};
  const apiFiles = [
    'getKelasOptions',
    'handleNewRegistration',
    'handleUpdateRegistration',
    'simpanStatusLanjutan',
    'getUpdateLogs',
    'getNotificationSettings',
    'saveNotificationSettings',
    'bulkUploadSiswaLanjutan',
    'migrateDataToFirebase',
    'updatePendaftaranSearchField',
    'updateSiswaLanjutanSearchField'
  ];
  for (const f of apiFiles) {
    try {
      require('./' + f);
      report.apiModules[f] = 'OK';
    } catch (e) {
      report.apiModules[f] = 'ERROR: ' + (e && e.message ? e.message : e);
    }
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

  // 11) Diagnostik EMAIL — hanya berjalan saat dipanggil ?test=email
  //     (https://<app>.vercel.app/api/health?test=email).
  //     Membuka tautan itu akan MENGIRIM email tes nyata ke penerima yang diatur.
  if (req.query && String(req.query.test) === 'email') {
    const emailReport = {};
    try {
      // Tentukan sumber daftar penerima (dokumen Firestore vs env var)
      const { getDoc, fromFirestoreFields } = require('../lib/firestore');
      const doc = await getDoc('settings', 'notifications');
      const docSettings = doc && doc.fields ? fromFirestoreFields(doc.fields) : null;
      const sumber = docSettings ? 'Firestore (tab Pengaturan)' : 'env NOTIFICATION_EMAILS';
      const emailsRaw = (docSettings && docSettings.emails) || process.env.NOTIFICATION_EMAILS || '';
      const recipients = emailsRaw.split(',').map(e => e.trim()).filter(Boolean);

      emailReport.sumberPenerima = sumber;
      emailReport.penerima = recipients.length
        ? recipients.map(e => e.replace(/^(.).*(@.*)$/, '$1***$2')).join(', ')
        : '(KOSONG)';
      emailReport.adaPenerima = recipients.length > 0;

      const host = process.env.SMTP_HOST;
      emailReport.smtp = {
        host: host ? 'terisi' : 'KOSONG',
        port: process.env.SMTP_PORT || '465 (default)',
        secure: String(process.env.SMTP_SECURE || 'true') === 'true' ? 'true' : 'false',
        user: process.env.SMTP_USER ? 'terisi' : 'KOSONG',
        pass: process.env.SMTP_PASS ? 'terisi' : 'KOSONG'
      };

      if (!recipients.length) {
        emailReport.hasil = 'GAGAL SEBELUM KIRIM: tidak ada email penerima. Isi daftar penerima di tab Pengaturan (atau set env NOTIFICATION_EMAILS).';
      } else if (!host) {
        emailReport.hasil = 'GAGAL SEBELUM KIRIM: SMTP_HOST belum diatur di Vercel (Environment Variables).';
      } else {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host,
          port: parseInt(process.env.SMTP_PORT || '465', 10),
          secure: String(process.env.SMTP_SECURE || 'true') === 'true',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
            : undefined
        });
        try {
          const info = await transporter.sendMail({
            from: `"${process.env.EMAIL_NAME || 'Sistem Pendaftaran Madania'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@localhost'}>`,
            to: recipients.join(','),
            subject: 'Tes notifikasi email dari /api/health',
            html: '<p>Ini email tes dari sistem pendaftaran. Jika Anda menerima ini, konfigurasi SMTP &amp; penerima sudah benar.</p>'
          });
          emailReport.hasil = 'TERKIRIM OK (messageId: ' + (info.messageId || '-') + ')';
        } catch (e) {
          emailReport.hasil = 'GAGAL KIRIM: ' + (e.message || e);
        }
      }
    } catch (e) {
      emailReport.hasil = 'ERROR: ' + (e.message || e);
    }
    report.emailTest = emailReport;
  }

  res.status(200).json(report);
};
