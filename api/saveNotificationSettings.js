
const { saveNotificationSettings } = require('../lib/settings');

module.exports = handler((settings) => saveNotificationSettings(settings));
module.exports.config = { maxDuration: 60 };
