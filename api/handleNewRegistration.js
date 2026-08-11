
const { handleNewRegistration } = require('../lib/registration');

module.exports = handler((formObj, firebaseId) => handleNewRegistration(formObj, firebaseId));
module.exports.config = { maxDuration: 60 };
