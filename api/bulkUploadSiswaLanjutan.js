const { handler } = require('../lib/handler');
const { bulkUploadSiswaLanjutan } = require('../lib/registration');

module.exports = handler(() => bulkUploadSiswaLanjutan());
module.exports.config = { maxDuration: 60 };
