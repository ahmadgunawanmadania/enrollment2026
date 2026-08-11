
const { migrateDataToFirebase } = require('../lib/registration');

module.exports = handler(() => migrateDataToFirebase());
module.exports.config = { maxDuration: 60 };
