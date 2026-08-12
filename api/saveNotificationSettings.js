const { handler } = require('../lib/handler');
const { saveNotificationSettings } = require('../lib/settings');

module.exports = handler((settings) => saveNotificationSettings(settings));
