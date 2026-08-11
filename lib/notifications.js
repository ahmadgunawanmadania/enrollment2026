/**
 * Notifikasi email & WhatsApp (port dari Code.gs).
 *
 * EMAIL — GAS memakai MailApp (Gmail pemilik script). Di Vercel dipakai SMTP:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_NAME
 * Jika SMTP_HOST kosong, email dilewati (dengan log) agar app tetap berjalan.
 *
 * WHATSAPP — sama seperti Code.gs: API Fonnte (https://api.fonnte.com/send)
 * dengan header Authorization = apiKey dari pengaturan.
 */
const nodemailer = require('nodemailer');
const { getNotificationSettings } = require('./settings');

/** Mengirim email notifikasi ke daftar penerima (port sendNotificationEmail). */
async function sendNotificationEmail(subject, htmlBody) {
  try {
    const settings = await getNotificationSettings();
    const recipients = (settings.emails || '').split(',').map(e => e.trim()).filter(Boolean);
    if (recipients.length === 0) {
      console.log('Tidak ada email penerima notifikasi yang diatur. Email tidak terkirim.');
      return;
    }

    const host = process.env.SMTP_HOST;
    if (!host) {
      console.log('SMTP_HOST belum diatur. Email notifikasi dilewati (ke: ' + recipients.join(', ') + ').');
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: String(process.env.SMTP_SECURE || 'true') === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined
    });

    await transporter.sendMail({
      from: `"${process.env.EMAIL_NAME || 'Sistem Pendaftaran Madania'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@localhost'}>`,
      to: recipients.join(','),
      subject,
      html: htmlBody
    });
    console.log('Email notifikasi terkirim ke: ' + recipients.join(', '));
  } catch (e) {
    console.error('Gagal mengirim email notifikasi: ' + e.message);
  }
}

/** Mengirim notifikasi WhatsApp via API Fonnte (port sendWhatsAppNotification). */
async function sendWhatsAppNotification(message) {
  try {
    const settings = await getNotificationSettings();
    const apiKey = settings.apiKey;
    const recipientString = settings.whatsapps;

    if (!apiKey || !recipientString) {
      console.log('Pengaturan API WhatsApp tidak lengkap. Pesan tidak terkirim.');
      return;
    }

    const recipients = recipientString.split(',').map(n => n.trim()).filter(Boolean);
    if (recipients.length === 0) {
      console.log('Tidak ada nomor WhatsApp penerima yang valid.');
      return;
    }

    const apiUrl = 'https://api.fonnte.com/send';

    for (let i = 0; i < recipients.length; i++) {
      try {
        // Jeda acak 5-15 detik untuk pengiriman setelah yang pertama
        if (i > 0) {
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 10000) + 5000));
        }
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: recipients[i], message })
        });
        const responseBody = await res.text();
        console.log(`Mencoba kirim WA ke: ${recipients[i]}. Respons dari API: ${responseBody}`);
      } catch (err) {
        console.error(`Gagal menghubungi API WhatsApp untuk nomor ${recipients[i]}. Error: ${err.toString()}`);
      }
    }
  } catch (e) {
    console.error('Gagal mengirim notifikasi WhatsApp: ' + e.message);
  }
}

module.exports = { sendNotificationEmail, sendWhatsAppNotification };
