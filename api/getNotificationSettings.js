const { handler } = require('../lib/handler');
const { getNotificationSettings } = require('../lib/settings');

module.exports = handler(() => getNotificationSettings());
