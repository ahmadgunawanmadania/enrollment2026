/**
 * Pembungkus untuk Vercel Serverless Function.
 *
 * Frontend (Index.html) memanggil fungsi melalui shim `google.script.run`
 * yang mengirim POST JSON ke `/api/<namaFungsi>` dengan body berupa array
 * argumen, mis. `[dataObj, docId]`.
 *
 * Fungsi di sini menangkap error dan mengembalikan JSON yang bisa dikenali
 * shim sebagai kegagalan: `{ __error: true, message }`.
 */
module.exports = function handler(fn) {
  return async function (req, res) {
    try {
      const body = req.body;
      const args = Array.isArray(body) ? body : body ? [body] : [];
      const result = await fn(...args);
      res.json(result);
    } catch (e) {
      console.error('[api error]', e);
      res.status(500).json({ __error: true, message: e.message || 'Terjadi kesalahan server.' });
    }
  };
};
