/**
 * Helper Firestore REST API.
 *
 * Menggantikan fungsi formatObjectForFirestore_() dan pemanggilan URL Fetch
 * pada Code.gs. Menggunakan service account yang sama (GOOGLE_* env vars).
 */
const { getAccessToken } = require('./google-auth');

const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;

function baseUrl() {
  if (!PROJECT_ID) throw new Error('GOOGLE_PROJECT_ID belum diatur di environment variables.');
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
}

/**
 * Konversi objek JS biasa menjadi format fields Firestore REST API
 * (port dari formatObjectForFirestore_ pada Code.gs).
 */
function toFirestoreFields(obj) {
  const fields = {};
  for (const key in obj) {
    const value = obj[key];
    let type = 'stringValue';
    let apiValue = value;

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        type = 'integerValue';
        apiValue = String(value);
      } else {
        type = 'doubleValue';
        apiValue = String(value);
      }
    } else if (value instanceof Date) {
      type = 'timestampValue';
      apiValue = value.toISOString();
    } else if (typeof value === 'boolean') {
      type = 'booleanValue';
    } else if (value === null || value === undefined || value === '') {
      type = 'nullValue';
      apiValue = null;
    } else {
      type = 'stringValue';
      apiValue = String(value);
    }

    fields[key] = { [type]: apiValue };
  }
  return fields;
}

/** Konversi fields Firestore REST API kembali menjadi objek JS biasa. */
function fromFirestoreFields(fields) {
  const obj = {};
  for (const key in fields) {
    const f = fields[key];
    if (f && 'stringValue' in f) obj[key] = f.stringValue;
    else if (f && 'integerValue' in f) obj[key] = parseInt(f.integerValue, 10);
    else if (f && 'doubleValue' in f) obj[key] = parseFloat(f.doubleValue);
    else if (f && 'booleanValue' in f) obj[key] = f.booleanValue;
    else if (f && 'timestampValue' in f) obj[key] = f.timestampValue;
    else if (f && 'nullValue' in f) obj[key] = null;
    else if (f && 'arrayValue' in f) {
      obj[key] = (f.arrayValue.values || []).map(v => {
        if (v && 'stringValue' in v) return v.stringValue;
        if (v && 'integerValue' in v) return parseInt(v.integerValue, 10);
        if (v && 'doubleValue' in v) return parseFloat(v.doubleValue);
        if (v && 'booleanValue' in v) return v.booleanValue;
        return null;
      });
    }
  }
  return obj;
}

async function request(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const url = `${baseUrl()}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore API error (${res.status}): ${text}`);
  }
  if (res.status === 404) return null;
  return res.json();
}

/**
 * Membaca satu dokumen. Mengembalikan null jika tidak ditemukan.
 * @returns {Promise<{name: string, fields: object}|null>}
 */
async function getDoc(collection, id) {
  return request(`${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
}

/**
 * Menulis dokumen. Dengan merge=true, field yang ada dipertahankan
 * (setara set(doc, data, { merge: true }) pada SDK).
 */
async function setDoc(collection, id, obj, { merge = true } = {}) {
  let path = `${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  if (merge) {
    const masks = Object.keys(obj)
      .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join('&');
    path += '?' + masks;
  }
  return request(path, { method: 'PATCH', body: { fields: toFirestoreFields(obj) } });
}

/**
 * Menampilkan dokumen-dokumen sebuah koleksi (dengan paginasi).
 * @returns {Promise<{documents: object[], nextPageToken: string|null}>}
 */
async function listDocs(collection, { pageSize = 150, pageToken } = {}) {
  let path = `${encodeURIComponent(collection)}?pageSize=${pageSize}`;
  if (pageToken) path += `&pageToken=${encodeURIComponent(pageToken)}`;
  const data = await request(path);
  if (!data) return { documents: [], nextPageToken: null };
  return { documents: data.documents || [], nextPageToken: data.nextPageToken || null };
}

/**
 * Memperbarui field tertentu dari sebuah dokumen yang sudah diketahui path-nya
 * (mis. dari hasil listDocs: doc.name = projects/.../documents/<col>/<id>).
 * Hanya field yang ada di `obj` yang diperbarui (updateMask), sisanya dipertahankan.
 */
async function patchDocByName(docName, obj) {
  const masks = Object.keys(obj)
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const token = await getAccessToken();
  const res = await fetch(`${docName}?${masks}`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: toFirestoreFields(obj) })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore API error (${res.status}): ${text}`);
  }
  return res.json();
}

module.exports = { getDoc, setDoc, listDocs, patchDocByName, toFirestoreFields, fromFirestoreFields };
