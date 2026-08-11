/**
 * Pengaturan notifikasi (email penerima, nomor WA, kredensial Fonnte).
 *
 * Di Code.gs disimpan di Script Properties; di Vercel disimpan sebagai dokumen
 * Firestore `settings/notifications` sehingga tetap bisa diedit lewat UI
 * (tab Pengaturan). Jika dokumen belum ada, nilai awal diambil dari env vars:
 *   NOTIFICATION_EMAILS, NOTIFICATION_WHATSAPPS, FONNTE_API_KEY, FONNTE_INSTANCE_ID
 */
const { getDoc, setDoc } = require('./firestore');

const COLLECTION = 'settings';
const DOC_ID = 'notifications';

async function getNotificationSettings() {
  try {
    const doc = await getDoc(COLLECTION, DOC_ID);
    if (doc && doc.fields) {
      const s = require('./firestore').fromFirestoreFields(doc.fields);
      return {
        emails: s.emails || '',
        whatsapps: s.whatsapps || '',
        apiKey: s.apiKey || '',
        instanceId: s.instanceId || ''
      };
    }
  } catch (e) {
    console.warn('Gagal membaca pengaturan dari Firestore, memakai env vars: ' + e.message);
  }
  return {
    emails: process.env.NOTIFICATION_EMAILS || '',
    whatsapps: process.env.NOTIFICATION_WHATSAPPS || '',
    apiKey: process.env.FONNTE_API_KEY || '',
    instanceId: process.env.FONNTE_INSTANCE_ID || ''
  };
}

async function saveNotificationSettings(settings) {
  const data = {
    emails: (settings && settings.emails) || '',
    whatsapps: (settings && settings.whatsapps) || '',
    apiKey: (settings && settings.apiKey) || '',
    instanceId: (settings && settings.instanceId) || ''
  };
  await setDoc(COLLECTION, DOC_ID, data, { merge: true });
  return { success: true, message: 'Pengaturan notifikasi berhasil disimpan.' };
}

module.exports = { getNotificationSettings, saveNotificationSettings };
