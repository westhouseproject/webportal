var nconf = require('nconf');
var path = require('path');

nconf.use('memory');

nconf.env();

nconf.set('environment', nconf.get('NODE_ENV') || 'production');

nconf.file({
  file: path.join(__dirname, nconf.get('environment') + '.json')
});

nconf.set('webportal:port', nconf.get('webportal:port') || 8080);
nconf.set('dbms:port', nconf.get('dbms:port') || 3000);

// On production, never, EVER drop the databases. Hence, here, we are setting
// nconf.get
if (nconf.get('environment') === 'production') {
  nconf.set('database:sync', false);
  nconf.set('database.forceSync', false);
}

module.exports = nconf;