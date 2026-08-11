const { handler } = require('../lib/handler');
const { getKelasOptions } = require('../lib/tarif');

module.exports = handler((jenjang) => getKelasOptions(jenjang));
