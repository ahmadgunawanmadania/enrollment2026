const { handler } = require('../lib/handler');
const { bulkUploadSiswaLanjutan } = require('../lib/registration');

module.exports = handler(() => bulkUploadSiswaLanjutan());
