
const { updateSiswaLanjutanSearchField } = require('../lib/registration');

module.exports = handler((pageToken) => updateSiswaLanjutanSearchField(pageToken));
module.exports.config = { maxDuration: 60 };
