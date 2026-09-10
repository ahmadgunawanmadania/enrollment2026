const { handler } = require('../lib/handler');
module.exports = handler(async () => {
  return {
    success: true,
    googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL || '(KOSONG)',
    googleProjectId: process.env.GOOGLE_PROJECT_ID || '(KOSONG)',
    spreadsheetId: process.env.SPREADSHEET_ID || '(KOSONG)',
    spreadsheetUrl: process.env.SPREADSHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit` : '(KOSONG)'
  };
});
