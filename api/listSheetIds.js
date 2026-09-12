const { handler } = require('../lib/handler');
const { readSheet } = require('../lib/sheets');
module.exports = handler(async () => {
  const { headers, rows } = await readSheet('Master_Data');
  const idIdx = headers.indexOf('ID_Pendaftaran');
  const ids = rows.map(r => r[idIdx]).filter(Boolean);
  return { success: true, headers, rowCount: rows.length, ids: ids.slice(-20) };
});
