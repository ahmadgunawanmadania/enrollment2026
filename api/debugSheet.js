const { handler } = require('../lib/handler');
const { readSheet } = require('../lib/sheets');

module.exports = handler(async () => {
  const sheets = ['Master_Data', 'Siswa_Lanjutan', 'Status_Lanjutan', 'Log_Update'];
  const result = {};
  for (const name of sheets) {
    try {
      const { headers, rows } = await readSheet(name);
      result[name] = { headers, rowCount: rows.length, sampleRows: rows.slice(-2) };
    } catch (e) {
      result[name] = { error: e.message };
    }
  }
  return { success: true, data: result };
});
