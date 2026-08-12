const { handler } = require('../lib/handler');
const { handleUpdateRegistration } = require('../lib/registration');

module.exports = handler((formObj, docId) => handleUpdateRegistration(formObj, docId));
