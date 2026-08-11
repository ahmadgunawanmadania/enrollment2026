const { handler } = require('../lib/handler');
const { getUpdateLogs } = require('../lib/registration');

module.exports = handler(() => getUpdateLogs());
