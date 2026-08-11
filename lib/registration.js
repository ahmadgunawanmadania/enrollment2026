/**
 * Logika bisnis utama — port dari Code.gs.
 * SpreadsheetApp diganti helper Sheets REST (lib/sheets.js),
 * Script Properties diganti lib/settings.js, MailApp/UrlFetchApp diganti lib/notifications.js.
 */

const { getTarifSSP, formatRupiah } = require('./tarif');
const { readSheet, readSheetRows, appendRow, updateRow, findRowByValue } = require('./sheets');
const { setDoc, listDocs, patchDocByName } = require('./firestore');
const { sendNotificationEmail, sendWhatsAppNotification } = require('./notifications');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'Sistem Vercel';

/** Konversi nilai menjadi Date yang valid; fallback ke waktu sekarang. */
function toSafeDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Mengambil angka dari string mata uang (hapus semua non-digit). */
function parseCurrency(value) {
  return parseFloat(String(value || 0).replace(/[^0-9]/g, '')) || 0;
}

// ---------------------------------------------------------------------------
// BACKUP KE GOOGLE SHEET
// ---------------------------------------------------------------------------

/** Port dari backupDataKeSheet — menambahkan baris pendaftaran ke Master_Data. */
async function backupDataKeSheet(formObj, firebaseId) {
  try {
    const rowData = [
      firebaseId, // ID dari Firebase
      toSafeDate(formObj.Timestamp), // konversi timestamp
      formObj.kategori,
      formObj.nama,
      formObj.kategoriSiswa || 'Reguler',
      formObj.punyaSibling || 'Tidak',
      formObj.namaSibling || '',
      formObj.kelasSibling || '',
      formObj.jenjang,
      formObj.kelas,
      formObj.periodeSSP || '',
      formObj.asalSekolah || '',
      formObj.asalInfo || '',
      formObj.noFormulir || '',
      formObj.tglFormulir || '',
      formObj.statusBooking || 'Tidak',
      formObj.tglBooking || '',
      formObj.metodeBayar || '',
      formObj.Status_Pendaftaran || 'Aktif',
      formObj.Tarif_SSP || 0,
      formObj.Diskon || 0,
      formObj.Tarif_Nett || 0,
      formObj.termin1 || 0,
      formObj.tglT1 || '',
      formObj.termin2 || 0,
      formObj.tglT2 || '',
      formObj.termin3 || 0,
      formObj.tglT3 || '',
      formObj.Total_Bayar || 0,
      formObj.Persentase_Bayar || 0
    ];
    await appendRow('Master_Data', rowData);
    return { success: true, message: 'Backup ke Google Sheet berhasil.' };
  } catch (e) {
    console.error('Gagal backup ke Sheet: ' + e.message);
    return { success: false, message: 'Gagal backup ke Google Sheet.' };
  }
}

// ---------------------------------------------------------------------------
// PENDaftARAN BARU / PINDAHAN
// ---------------------------------------------------------------------------

/** Port dari handleNewRegistration — backup + notifikasi email/WA. */
async function handleNewRegistration(formObj, firebaseId) {
  await backupDataKeSheet(formObj, firebaseId);

  const kategori = formObj.kategori || '';
  const namaSiswa = formObj.nama || '';
  let subject = '';
  let jenisPendaftar = '';

  if (kategori.startsWith('Baru')) {
    subject = `Notifikasi: Pendaftaran Siswa Baru - ${namaSiswa}`;
    jenisPendaftar = 'Siswa Baru';
  } else if (kategori.startsWith('Pindahan')) {
    subject = `Notifikasi: Pendaftaran Siswa Pindahan - ${namaSiswa}`;
    jenisPendaftar = 'Siswa Pindahan';
  }

  if (subject) {
    const sspDibayarText = formObj.statusBooking === 'Ya'
      ? `<li><strong>SSP Dibayar:</strong> Rp ${formatRupiah(formObj.Total_Bayar)}</li>` : '';
    const siblingText = formObj.punyaSibling === 'Ya'
      ? `<li><strong>Nama Sibling:</strong> ${formObj.namaSibling}</li>` : '';
    const htmlBody = `
      <p>Notifikasi Pendaftaran</p>
      <ul>
        <li><strong>Jenis:</strong> ${jenisPendaftar}</li>
        <li><strong>Nama:</strong> ${namaSiswa}</li>
        <li><strong>Jenjang:</strong> ${formObj.jenjang}</li>
        <li><strong>Kelas:</strong> ${formObj.kelas}</li>
        <li><strong>Sibling:</strong> ${formObj.punyaSibling}</li>
        ${siblingText}
        <li><strong>Status Booking:</strong> ${formObj.statusBooking}</li>
        ${sspDibayarText}
      </ul>
      <p>ID Pendaftaran: ${firebaseId}</p>
      <p>Silakan periksa data di sistem pendaftaran.</p>`;
    await sendNotificationEmail(subject, htmlBody);

    const waMessage = `*Notifikasi Pendaftaran*\n\n- Jenis: ${jenisPendaftar}\n- Nama: ${namaSiswa}\n- Jenjang: ${formObj.jenjang}\n- Kelas: ${formObj.kelas}\n- Sibling: ${formObj.punyaSibling}${formObj.punyaSibling === 'Ya' ? `\n- Nama Sibling: ${formObj.namaSibling}` : ''}\n- Status Booking: ${formObj.statusBooking}${formObj.statusBooking === 'Ya' ? `\n- SSP Dibayar: Rp ${formatRupiah(formObj.Total_Bayar)}` : ''}\n\nID: ${firebaseId}`;
    await sendWhatsAppNotification(waMessage);
  }

  return { success: true, message: 'Data pendaftaran diproses (backup & notifikasi).' };
}

// ---------------------------------------------------------------------------
// UPDATE DATA PENDaftARAN
// ---------------------------------------------------------------------------

/** Susun array 30 kolom Master_Data (port dari updateDataPendaftaran). */
function buildMasterRow(formObj, idPendaftaran, oldTimestamp, oldRow) {
  const tarifSSP = getTarifSSP(formObj.jenjang, formObj.periodeSSP, formObj.kategori);
  const diskon = parseCurrency(formObj.diskon);
  const tarifNett = tarifSSP - diskon;

  let totalBayar = 0;
  let t1 = 0, t2 = 0, t3 = 0;
  if (formObj.metodeBayar && String(formObj.metodeBayar).startsWith('Lunas')) {
    totalBayar = tarifNett;
  } else {
    t1 = parseCurrency(formObj.termin1);
    t2 = parseCurrency(formObj.termin2);
    t3 = parseCurrency(formObj.termin3);
    totalBayar = t1 + t2 + t3;
  }
  const persen = tarifNett > 0 ? (totalBayar / tarifNett) * 100 : 0;

  return [
    idPendaftaran, // 0: ID tetap
    oldTimestamp,  // 1: Timestamp asli
    formObj.kategori, // 2
    formObj.nama, // 3
    formObj.kategoriSiswa,
    formObj.punyaSibling,
    formObj.namaSibling,
    formObj.kelasSibling,
    formObj.jenjang,
    formObj.kelas,
    formObj.periodeSSP,
    formObj.asalSekolah,
    formObj.asalInfo,
    formObj.noFormulir,
    formObj.tglFormulir,
    formObj.statusBooking,
    formObj.tglBooking,
    formObj.metodeBayar,
    formObj.statusPendaftaran || 'Aktif',
    tarifSSP,
    diskon,
    tarifNett,
    t1,
    formObj.tglT1,
    t2,
    formObj.tglT2,
    t3,
    formObj.tglT3,
    totalBayar,
    persen
  ];
}

/**
 * Backup UPDATE pendaftaran ke Master_Data + catat perubahan ke Log_Update
 * + notifikasi jika status berubah menjadi "Mengundurkan Diri".
 * (Fungsi handleUpdateRegistration tidak ada di Code.gs; diimplementasikan
 *  di sini berdasarkan logika updateDataPendaftaran.)
 */
async function handleUpdateRegistration(formObj, docId) {
  const idPendaftaran = docId || formObj.idPendaftaranUpdate;
  const ketUpdate = formObj.keteranganUpdate || 'Update Reguler';

  const { headers, rows } = await readSheet('Master_Data');
  const idIndex = headers.indexOf('ID_Pendaftaran');
  let rowIndex = null;
  let dataLama = null;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][idIndex]) === String(idPendaftaran)) {
      rowIndex = i + 2; // +1 header, +1 1-based
      dataLama = rows[i];
      break;
    }
  }

  // Jika ID belum ada di Sheet (mis. pendaftaran lama yang tidak pernah di-backup),
  // tambahkan sebagai baris baru.
  if (!dataLama) {
    const res = await backupDataKeSheet(formObj, idPendaftaran);
    return { success: res.success, message: res.message };
  }

  const statusIndex = headers.indexOf('Status_Pendaftaran');
  const oldStatus = dataLama[statusIndex];
  const newStatus = formObj.statusPendaftaran;

  // Notifikasi pengunduran diri
  if (newStatus === 'Mengundurkan Diri' && oldStatus !== 'Mengundurkan Diri') {
    const namaSiswa = formObj.nama;
    const jenjang = formObj.jenjang;
    const kelas = formObj.kelas;
    const subject = `Notifikasi: Siswa Mengundurkan Diri - ${namaSiswa}`;
    const htmlBody = `
      <p>Siswa berikut telah mengubah statusnya menjadi <strong>Mengundurkan Diri</strong>:</p>
      <ul><li><strong>Nama:</strong> ${namaSiswa}</li><li><strong>Jenjang:</strong> ${jenjang}</li><li><strong>Kelas:</strong> ${kelas}</li><li><strong>ID Pendaftaran:</strong> ${idPendaftaran}</li></ul>
      <p>Pembaruan dilakukan oleh: ${ADMIN_EMAIL} pada ${new Date().toLocaleString('id-ID')}</p><p>Silakan periksa data di sistem pendaftaran.</p>`;
    await sendNotificationEmail(subject, htmlBody);

    const waMessage = `*Notifikasi Pengunduran Diri*\n\nSiswa berikut telah mengundurkan diri:\n- Nama: ${namaSiswa}\n- Jenjang: ${jenjang}\n- Kelas: ${kelas}\n- ID: ${idPendaftaran}`;
    await sendWhatsAppNotification(waMessage);
  }

  const oldTimestamp = dataLama[1];
  const dataBaruArr = buildMasterRow(formObj, idPendaftaran, oldTimestamp, dataLama);

  // Bandingkan kolom 3 ke atas (mulai index 2, abaikan ID & Timestamp)
  const logsToAppend = [];
  for (let i = 2; i < headers.length; i++) {
    const valLamaStr = String(dataLama[i]);
    const valBaruStr = String(dataBaruArr[i]);
    if (valLamaStr !== valBaruStr) {
      const logId = 'LOG-' + Math.floor(Math.random() * 9000000);
      logsToAppend.push([logId, new Date(), idPendaftaran, ADMIN_EMAIL, headers[i], valLamaStr, valBaruStr, ketUpdate]);
    }
  }

  if (logsToAppend.length > 0) {
    // Catat log
    for (const log of logsToAppend) {
      await appendRow('Log_Update', log);
    }
    // Timpa baris di Master_Data
    await updateRow('Master_Data', rowIndex, dataBaruArr);
    return { success: true, message: 'Data dan log berhasil diperbarui!' };
  }

  return { success: true, message: 'Tidak ada perubahan data.' };
}

// ---------------------------------------------------------------------------
// STATUS KELANJUTAN SISWA
// ---------------------------------------------------------------------------

/** Port dari simpanStatusLanjutan. */
async function simpanStatusLanjutan(formObj) {
  try {
    const namaSiswaArr = formObj.nama ? String(formObj.nama).split('|') : [];
    if (namaSiswaArr.length < 2) {
      return { success: false, message: 'Format data nama siswa tidak valid. Harap pilih ulang dari dropdown.' };
    }
    const idSiswa = namaSiswaArr[0];
    const namaSiswa = namaSiswaArr[1];

    // Cek apakah siswa sudah tercatat di Status_Lanjutan
    const existingRowIndex = await findRowByValue('Status_Lanjutan', 'ID_Siswa', idSiswa);

    let idPendaftaranBaru = null;

    // Jika siswa melanjutkan, buat pendaftaran baru di Master_Data
    if (formObj.status === 'Lanjut') {
      const jenjangMap = { TK: 'SD', SD: 'SMP', SMP: 'SMA' };
      const kelasMap = { TK: 'G1', SD: 'G7', SMP: 'G10' };
      const jenjangTujuan = jenjangMap[formObj.kelasAsal] || '';
      const kelasTujuan = kelasMap[formObj.kelasAsal] || '';

      const year = new Date().getFullYear();
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      idPendaftaranBaru = 'REG-' + year + '-' + randomNum;
      const timestamp = new Date();

      const periode = formObj.periodeSSP;
      let kategoriForTariff = 'Lanjutan Internal';
      if (formObj.kelasAsal === 'TK') {
        kategoriForTariff = 'Baru 2027/2028';
      } else if (formObj.kelasAsal === 'SD' && String(periode) === '6') {
        kategoriForTariff = 'Baru 2027/2028';
      }

      const tarifSSP = getTarifSSP(jenjangTujuan, periode, kategoriForTariff);
      const diskon = parseCurrency(formObj.diskon);
      const tarifNett = tarifSSP - diskon;

      let totalBayar = 0;
      let t1 = 0, t2 = 0, t3 = 0;
      if (formObj.metodeBayar && String(formObj.metodeBayar).startsWith('Lunas')) {
        totalBayar = tarifNett;
      } else {
        t1 = parseCurrency(formObj.termin1);
        t2 = parseCurrency(formObj.termin2);
        t3 = parseCurrency(formObj.termin3);
        totalBayar = t1 + t2 + t3;
      }
      const persen = tarifNett > 0 ? (totalBayar / tarifNett) * 100 : 0;

      const rowData = [
        idPendaftaranBaru,
        timestamp,
        'Lanjutan Internal',
        namaSiswa,
        formObj.kategoriSiswa,
        'Tidak',
        '',
        '',
        jenjangTujuan,
        kelasTujuan,
        periode,
        'Madania (Internal)',
        'Internal',
        formObj.noFormulir,
        formObj.tglFormulir,
        formObj.statusBooking,
        formObj.tglBooking,
        formObj.metodeBayar,
        'Aktif',
        tarifSSP,
        diskon,
        tarifNett,
        t1, formObj.tglT1,
        t2, formObj.tglT2,
        t3, formObj.tglT3,
        totalBayar,
        persen
      ];
      await appendRow('Master_Data', rowData);

      // Notifikasi siswa lanjutan
      const subject = `Notifikasi: Pendaftaran Siswa Lanjutan - ${namaSiswa}`;
      const jenisPendaftar = 'Siswa Lanjutan';
      const sspDibayarText = formObj.statusBooking === 'Ya'
        ? `<li><strong>SSP Dibayar:</strong> Rp ${formatRupiah(totalBayar)}</li>` : '';
      const htmlBody = `
        <p>Notifikasi Pendaftaran</p>
        <ul>
          <li><strong>Jenis:</strong> ${jenisPendaftar}</li>
          <li><strong>Nama:</strong> ${namaSiswa}</li>
          <li><strong>Jenjang:</strong> ${jenjangTujuan}</li>
          <li><strong>Kelas:</strong> ${kelasTujuan}</li>
          <li><strong>Sibling:</strong> Tidak</li>
          <li><strong>Status Booking:</strong> ${formObj.statusBooking}</li>
          ${sspDibayarText}
        </ul>
        <p>ID Pendaftaran: ${idPendaftaranBaru}</p>
        <p>Silakan periksa data di sistem pendaftaran.</p>`;
      await sendNotificationEmail(subject, htmlBody);

      const waMessage = `*Notifikasi Pendaftaran*\n\n- Jenis: ${jenisPendaftar}\n- Nama: ${namaSiswa}\n- Jenjang: ${jenjangTujuan}\n- Kelas: ${kelasTujuan}\n- Sibling: Tidak\n- Status Booking: ${formObj.statusBooking}${formObj.statusBooking === 'Ya' ? `\n- SSP Dibayar: Rp ${formatRupiah(totalBayar)}` : ''}\n\nID: ${idPendaftaranBaru}`;
      await sendWhatsAppNotification(waMessage);
    }

    // Catat status ke sheet Status_Lanjutan
    const timestamp = new Date();
    const statusRowData = [
      timestamp, idSiswa, namaSiswa, formObj.kelasAsal, formObj.kategoriSiswa,
      formObj.konfirmasi, formObj.status, formObj.alasan || '', idPendaftaranBaru
    ];

    if (existingRowIndex) {
      await updateRow('Status_Lanjutan', existingRowIndex, statusRowData);
    } else {
      await appendRow('Status_Lanjutan', statusRowData);
    }

    return { success: true, message: 'Status kelanjutan siswa berhasil disimpan.' };
  } catch (e) {
    console.error('Error di simpanStatusLanjutan: ' + e.message);
    return { success: false, message: 'Error server saat menyimpan status: ' + e.message };
  }
}

// ---------------------------------------------------------------------------
// LOG UPDATE
// ---------------------------------------------------------------------------

/** Port dari getUpdateLogs — ambil 10 log terbaru (dibalik). */
async function getUpdateLogs() {
  try {
    const { headers, rows } = await readSheet('Log_Update');
    if (headers.length === 0) {
      return { success: true, data: [] };
    }

    const logsToShow = 10;
    const recentRows = rows.slice(Math.max(0, rows.length - logsToShow));
    const logs = recentRows
      .map(row => {
        const logObject = {};
        headers.forEach((header, index) => {
          logObject[header] = row[index];
        });
        return logObject;
      })
      .reverse();

    return { success: true, data: logs };
  } catch (e) {
    console.error('Error di getUpdateLogs: ' + e.message);
    return { success: false, message: 'Gagal mengambil log pembaruan: ' + e.message };
  }
}

// ---------------------------------------------------------------------------
// BULK UPLOAD & MIGRASI DATA
// ---------------------------------------------------------------------------

function cleanDocId(raw) {
  return String(raw).trim().replace(/[^a-zA-Z0-9-]/g, '');
}

/** Port dari bulkUploadSiswaLanjutan — sheet Siswa_Lanjutan -> Firestore masterSiswa. */
async function bulkUploadSiswaLanjutan() {
  try {
    const { headers, rows } = await readSheet('Siswa_Lanjutan');
    const idIndex = headers.indexOf('ID_Siswa');
    const namaIndex = headers.indexOf('Nama_Lengkap');
    const kelasAsalIndex = headers.indexOf('Kelas_Asal');

    if (idIndex === -1 || namaIndex === -1 || kelasAsalIndex === -1) {
      return { success: false, message: "Header di sheet 'Siswa_Lanjutan' tidak lengkap. Pastikan ada 'ID_Siswa', 'Nama_Lengkap', dan 'Kelas_Asal'." };
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      const docIdRaw = row[idIndex] ? String(row[idIndex]).trim() : null;
      if (!docIdRaw) { skippedCount++; continue; }

      const docId = cleanDocId(docIdRaw);
      if (!docId) { errorCount++; continue; }

      await setDoc('masterSiswa', docId, {
        Nama_Siswa: row[namaIndex],
        Jenjang: row[kelasAsalIndex]
      }, { merge: true });
      successCount++;
    }

    let message = `Upload selesai. ${successCount} data berhasil di-upload.`;
    if (errorCount > 0) message += ` ${errorCount} data gagal karena ID tidak valid.`;
    if (skippedCount > 0) message += ` ${skippedCount} baris dilewati karena ID kosong.`;
    return { success: true, message };
  } catch (e) {
    console.error(e);
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

/** Pemetaan header Master_Data (Sheet) -> nama field dokumen Firestore 'pendaftaran'. */
const MASTER_TO_FIRESTORE = {
  'Kategori_Pendaftaran': 'kategori',
  'Nama_Siswa': 'nama',
  'Kategori_Siswa': 'kategoriSiswa',
  'Punya_Sibling': 'punyaSibling',
  'Nama_Sibling': 'namaSibling',
  'Kelas_Sibling': 'kelasSibling',
  'Jenjang': 'jenjang',
  'Kelas': 'kelas',
  'Periode_SSP': 'periodeSSP',
  'Asal_Sekolah': 'asalSekolah',
  'Asal_Info': 'asalInfo',
  'No_Formulir': 'noFormulir',
  'Tgl_Formulir': 'tglFormulir',
  'Status_Booking': 'statusBooking',
  'Tgl_Booking': 'tglBooking',
  'Metode_Bayar_SSP': 'metodeBayar',
  'Status_Pendaftaran': 'Status_Pendaftaran',
  'Tarif_SSP': 'Tarif_SSP',
  'Diskon': 'Diskon',
  'Tarif_Nett': 'Tarif_Nett',
  'Termin_1_Nominal': 'termin1',
  'Termin_1_Tgl': 'tglT1',
  'Termin_2_Nominal': 'termin2',
  'Termin_2_Tgl': 'tglT2',
  'Termin_3_Nominal': 'termin3',
  'Termin_3_Tgl': 'tglT3',
  'Total_Bayar': 'Total_Bayar',
  'Persentase_Bayar': 'Persentase_Bayar'
};

/** Mencoba mengubah string menjadi Date jika valid (untuk kolom Timestamp). */
function parseDateCell(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date((value - 25569) * 86400 * 1000); // serial Sheets
  const str = String(value || '').trim();
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Jumlah baris yang diproses per panggilan API saat migrasi bertahap.
// Nilai kecil agar setiap panggilan muat dalam batas waktu serverless Vercel
// (10 detik di paket Hobby).
const MIGRATION_BATCH = 10;

/**
 * Migrasi data dari Google Sheets ke Firestore, dijalankan BERTAHAP (per-batch)
 * supaya muat dalam batas waktu serverless Vercel. Fungsi ini tidak ada di
 * Code.gs; dibuat agar tombol "Migrasi Data" di UI berfungsi.
 *
 * Setiap panggilan menerima state { step, offset } dan memproses sebagian kecil
 * baris, lalu mengembalikan { done: false, nextState } agar UI memanggil batch
 * berikutnya, atau { done: true } saat selesai. Pemakaian merge: true membuat
 * migrasi idempoten (aman dijalankan ulang).
 *
 *   step 'master' -> Master_Data       -> koleksi pendaftaran/{ID_Pendaftaran}
 *   step 'siswa'  -> Siswa_Lanjutan    -> koleksi masterSiswa/{ID_Siswa}
 *   step 'status' -> Status_Lanjutan   -> koleksi siswaLanjutan/{ID_Siswa}
 */
async function migrateDataToFirebase(state) {
  try {
    const st = state && typeof state === 'object' ? state : {};
    const step = st.step || 'master';
    const offset = Number(st.offset) || 0;

    if (step === 'master') {
      const { headers, rows } = await readSheetRows('Master_Data', offset, MIGRATION_BATCH);
      let count = 0;
      for (const row of rows) {
        if (!row[0] || String(row[0]).trim() === '') continue;
        const id = cleanDocId(row[0]);
        if (!id) continue;
        const doc = {};
        headers.forEach((header, i) => {
          if (header === 'Timestamp') {
            const d = parseDateCell(row[i]);
            if (d) doc.Timestamp = d;
          } else if (MASTER_TO_FIRESTORE[header]) {
            doc[MASTER_TO_FIRESTORE[header]] = row[i];
          }
        });
        const nama = doc.nama;
        if (nama) doc.nama_lowercase = String(nama).toLowerCase();
        await setDoc('pendaftaran', id, doc, { merge: true });
        count++;
      }
      if (rows.length === MIGRATION_BATCH) {
        return { success: true, done: false, step: 'master', processed: count, nextState: { step: 'master', offset: offset + MIGRATION_BATCH } };
      }
      return { success: true, done: false, step: 'master', processed: count, nextState: { step: 'siswa', offset: 0 } };
    }

    if (step === 'siswa') {
      const { headers, rows } = await readSheetRows('Siswa_Lanjutan', offset, MIGRATION_BATCH);
      const idIndex = headers.indexOf('ID_Siswa');
      const namaIndex = headers.indexOf('Nama_Lengkap');
      const kelasIndex = headers.indexOf('Kelas_Asal');
      let count = 0;
      for (const row of rows) {
        const docIdRaw = idIndex === -1 ? null : row[idIndex];
        if (!docIdRaw) continue;
        const id = cleanDocId(docIdRaw);
        if (!id) continue;
        await setDoc('masterSiswa', id, {
          Nama_Siswa: namaIndex === -1 ? '' : row[namaIndex],
          Jenjang: kelasIndex === -1 ? '' : row[kelasIndex]
        }, { merge: true });
        count++;
      }
      if (rows.length === MIGRATION_BATCH) {
        return { success: true, done: false, step: 'siswa', processed: count, nextState: { step: 'siswa', offset: offset + MIGRATION_BATCH } };
      }
      return { success: true, done: false, step: 'siswa', processed: count, nextState: { step: 'status', offset: 0 } };
    }

    if (step === 'status') {
      const { headers, rows } = await readSheetRows('Status_Lanjutan', offset, MIGRATION_BATCH);
      const idIndex = headers.indexOf('ID_Siswa');
      const get = (row, h) => row[headers.indexOf(h)];
      let count = 0;
      for (const row of rows) {
        const docIdRaw = idIndex === -1 ? null : row[idIndex];
        if (!docIdRaw) continue;
        const id = cleanDocId(docIdRaw);
        if (!id) continue;
        const statusVal = get(row, 'Status_Kelanjutan');
        const doc = {
          Timestamp: parseDateCell(get(row, 'Timestamp')) || new Date(),
          ID_Siswa: id,
          Nama_Siswa: get(row, 'Nama_Siswa'),
          Kelas_Asal: get(row, 'Kelas_Asal'),
          kelasAsal: get(row, 'Kelas_Asal'),
          Kategori_Siswa: get(row, 'Kategori_Siswa'),
          kategoriSiswa: get(row, 'Kategori_Siswa'),
          Konfirmasi_Kelanjutan: get(row, 'Konfirmasi_Kelanjutan'),
          konfirmasi: get(row, 'Konfirmasi_Kelanjutan'),
          Status_Kelanjutan: statusVal,
          status: statusVal,
          Alasan: get(row, 'Alasan'),
          alasan: get(row, 'Alasan'),
          ID_Pendaftaran_Baru: get(row, 'ID_Pendaftaran_Baru')
        };
        const nama = get(row, 'Nama_Siswa');
        if (nama) doc.Nama_Siswa_lowercase = String(nama).toLowerCase();
        await setDoc('siswaLanjutan', id, doc, { merge: true });
        count++;
      }
      if (rows.length === MIGRATION_BATCH) {
        return { success: true, done: false, step: 'status', processed: count, nextState: { step: 'status', offset: offset + MIGRATION_BATCH } };
      }
      return { success: true, done: true, step: 'status', processed: count, message: 'Migrasi selesai: semua sheet dipindahkan ke Firestore.' };
    }

    // Step tidak dikenal (atau 'done' dipanggil langsung)
    return { success: true, done: true, message: 'Migrasi selesai.' };
  } catch (e) {
    console.error('Error migrasi: ' + e.message);
    return { success: false, message: 'Migrasi gagal: ' + e.message };
  }
}

// ---------------------------------------------------------------------------
// BACKFILL FIELD LOWERCASE (port updateCollectionWithLowercaseField_)
// ---------------------------------------------------------------------------

/**
 * Menambahkan field lowercase untuk pencarian case-insensitive.
 * @param {string} collection Nama koleksi.
 * @param {string} nameField Field nama asli.
 * @param {string} lowercaseField Field lowercase tujuan.
 * @param {string|null} pageToken Token paginasi.
 */
async function updateSearchField(collection, nameField, lowercaseField, pageToken) {
  try {
    const { documents, nextPageToken } = await listDocs(collection, { pageSize: 150, pageToken: pageToken || null });

    if (!documents || documents.length === 0) {
      return { success: true, processedCount: 0, nextPageToken: null };
    }

    let updatedCount = 0;
    for (const doc of documents) {
      const data = doc.fields;
      if (data && data[nameField] && data[nameField].stringValue && !data[lowercaseField]) {
        await patchDocByName(doc.name, { [lowercaseField]: data[nameField].stringValue.toLowerCase() });
        updatedCount++;
      }
    }

    return { success: true, processedCount: documents.length, nextPageToken: nextPageToken || null };
  } catch (e) {
    console.error('Error saat memproses koleksi ' + collection + ': ' + e.message);
    return { success: false, message: 'Error saat memproses koleksi ' + collection + ': ' + e.toString(), nextPageToken: null };
  }
}

/** Port updatePendaftaranSearchField. */
async function updatePendaftaranSearchField(pageToken) {
  return updateSearchField('pendaftaran', 'nama', 'nama_lowercase', pageToken);
}

/** Port updateSiswaLanjutanSearchField. */
async function updateSiswaLanjutanSearchField(pageToken) {
  return updateSearchField('siswaLanjutan', 'Nama_Siswa', 'Nama_Siswa_lowercase', pageToken);
}

module.exports = {
  backupDataKeSheet,
  handleNewRegistration,
  handleUpdateRegistration,
  simpanStatusLanjutan,
  getUpdateLogs,
  bulkUploadSiswaLanjutan,
  migrateDataToFirebase,
  updatePendaftaranSearchField,
  updateSiswaLanjutanSearchField
};
