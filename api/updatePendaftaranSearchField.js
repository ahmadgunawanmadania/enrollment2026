const { handler } = require('../lib/handler');
const { updatePendaftaranSearchField } = require('../lib/registration');

module.exports = handler((pageToken) => updatePendaftaranSearchField(pageToken));
module.exports.config = { maxDuration: 60 };
