
const { simpanStatusLanjutan } = require('../lib/registration');

module.exports = handler((formObj) => simpanStatusLanjutan(formObj));
module.exports.config = { maxDuration: 60 };
