/**
 * Otentikasi Service Account Google (untuk Google Sheets API & Firestore REST API).
 *
 * Menggantikan fungsi getFirestoreAccessToken_() pada Code.gs.
 * Kredensial dibaca dari environment variable (Vercel):
 *   GOOGLE_PROJECT_ID    -> project_id pada file JSON service account
 *   GOOGLE_CLIENT_EMAIL  -> client_email pada file JSON service account
 *   GOOGLE_PRIVATE_KEY   -> private_key pada file JSON service account
 *                           (boleh berisi literal "\n" seperti di Code.gs,
 *                            baris baru asli, atau base64 dari key PEM)
 */
const jwt = require('jsonwebtoken');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/datastore'
].join(' ');

let cached = { token: null, expiresAt: 0 };

function normalizePrivateKey(raw) {
  if (!raw) throw new Error('GOOGLE_PRIVATE_KEY belum diatur di environment variables.');
  let key = String(raw).trim();
  // 1) Jika base64, decode dulu
  if (!key.includes('BEGIN') && !key.includes('\n')) {
    try {
      key = Buffer.from(key, 'base64').toString('utf8');
    } catch (e) {
      /* bukan base64, biarkan apa adanya */
    }
  }
  // 2) Ganti literal "\n" (biasanya hasil copy dari file JSON / Code.gs) dengan baris baru asli
  key = key.replace(/\\n/g, '\n');
  if (!key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('GOOGLE_PRIVATE_KEY tidak valid: tidak ditemukan blok "BEGIN PRIVATE KEY".');
  }
  return key;
}

/**
 * Mendapatkan (dan meng-cache) access token OAuth2 untuk service account.
 * @returns {Promise<string>} access token
 */
async function getAccessToken() {
  if (cached.token && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  if (!clientEmail) throw new Error('GOOGLE_CLIENT_EMAIL belum diatur di environment variables.');

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { scope: SCOPES },
    normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    {
      algorithm: 'RS256',
      issuer: clientEmail,
      subject: clientEmail,
      audience: 'https://oauth2.googleapis.com/token',
      expiresIn: 3600
    }
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error('Gagal mendapatkan access token: ' + JSON.stringify(data));
  }

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000
  };
  return cached.token;
}

module.exports = { getAccessToken, normalizePrivateKey };
