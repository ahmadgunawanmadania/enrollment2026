
 * Aman dibuka langsung di browser: https://<app>.vercel.app/api/health
 */

const DEPLOY_VERSION = '2026-08-11-fix-search-batch-commit-v2';
const DEPLOY_VERSION = '2026-08-11-fix-search-batch-commit-v3';

module.exports = async function (req, res) {
  const report = {
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

  // 7) Simulasi pemanggilan getNotificationSettings PERSIS seperti endpoint aslinya
  //    (melewati lib/handler.js) — untuk meniru perilaku /api/getNotificationSettings.
  try {
