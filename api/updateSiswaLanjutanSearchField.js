const { handler } = require('../lib/handler');
const { updateSiswaLanjutanSearchField } = require('../lib/registration');

module.exports = handler((pageToken) => updateSiswaLanjutanSearchField(pageToken));
