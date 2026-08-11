const { handler } = require('../lib/handler');
const { migrateDataToFirebase } = require('../lib/registration');

module.exports = handler((state) => migrateDataToFirebase(state));
