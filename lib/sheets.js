/**
 * Helper Google Sheets API (REST).
 *
 * Menggantikan SpreadsheetApp pada Code.gs. Membutuhkan env var SPREADSHEET_ID
 * (ID dari URL spreadsheet, mis. https://docs.google.com/spreadsheets/d/<ID>/edit).
 *
 * Spreadsheet harus dibagikan (share) ke client_email service account
 * (GOOGLE_CLIENT_EMAIL) sebagai Editor agar bisa dibaca/ditulis.
 */
const { getAccessToken } = require('./google-auth');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function api(path, { method = 'GET', body } = {}) {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID belum diatur di environment variables.');
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Sheets API error (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Membaca seluruh data sebuah sheet.
 * @param {string} sheetName Nama sheet (mis. "Master_Data").
 * @returns {Promise<{headers: string[], rows: any[][]}>}
 */
async function readSheet(sheetName) {
  const data = await api(`values/${encodeURIComponent(sheetName)}!A1:ZZ20000`);
  const values = data.values || [];
  const headers = values[0] || [];
  return { headers, rows: values.slice(1) };
}

/**
 * Membaca sebagian baris sebuah sheet (untuk migrasi bertahap).
 * @param {string} sheetName Nama sheet.
 * @param {number} startRow0 Indeks baris data pertama yang dibaca (0 = baris data pertama, di bawah header).
 * @param {number} count Jumlah baris yang dibaca.
 * @returns {Promise<{headers: string[], rows: any[][]}>}
 */
async function readSheetRows(sheetName, startRow0, count) {
  const headerData = await api(`values/${encodeURIComponent(sheetName + '!A1:ZZ1')}`);
  const first = startRow0 + 2; // +1 header, +1 1-based
  const last = first + count - 1;
  const batchData = await api(`values/${encodeURIComponent(sheetName + '!A' + first + ':ZZ' + last)}`);
  return {
    headers: (headerData.values && headerData.values[0]) || [],
    rows: batchData.values || []
  };
}

/**
 * Menambahkan satu baris di akhir sheet.
 * @param {string} sheetName Nama sheet.
 * @param {any[]} row Array nilai baris.
 */
async function appendRow(sheetName, row) {
  await api(`values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: {
      values: [row.map(toSheetValue)],
      majorDimension: 'ROWS'
    }
  });
}

/**
 * Memperbarui satu baris pada sheet (1-based).
 * @param {string} sheetName Nama sheet.
 * @param {number} rowIndex Nomor baris (1 = baris pertama data).
 * @param {any[]} values Array nilai baris baru.
 */
async function updateRow(sheetName, rowIndex, values) {
  const endCol = colLetter(values.length);
  await api(`values/${encodeURIComponent(sheetName)}!A${rowIndex}:${endCol}${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: {
      values: [values.map(toSheetValue)],
      majorDimension: 'ROWS'
    }
  });
}

/**
 * Menemukan nomor baris (1-based, termasuk header) berdasarkan nilai pada kolom.
 * @param {string} sheetName Nama sheet.
 * @param {string} headerName Nama kolom (header).
 * @param {string} value Nilai yang dicari.
 * @returns {Promise<number|null>} Nomor baris di spreadsheet, atau null.
 */
async function findRowByValue(sheetName, headerName, value) {
  const { headers, rows } = await readSheet(sheetName);
  const idx = headers.indexOf(headerName);
  if (idx === -1) return null;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][idx]) === String(value)) return i + 2; // +1 header, +1 1-based
  }
  return null;
}

/** Konversi nilai JavaScript menjadi nilai yang ramah untuk ditulis ke Sheets. */
function toSheetValue(value) {
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  if (value === null || value === undefined) return '';
  return value;
}

module.exports = { readSheet, readSheetRows, appendRow, updateRow, findRowByValue };
