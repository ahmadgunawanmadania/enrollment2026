const { handler } = require('../lib/handler');
const { handleNewRegistration } = require('../lib/registration');

module.exports = handler((formObj, firebaseId) => handleNewRegistration(formObj, firebaseId));
