const { handler } = require('../lib/handler');
const { simpanStatusLanjutan } = require('../lib/registration');

module.exports = handler((formObj) => simpanStatusLanjutan(formObj));
