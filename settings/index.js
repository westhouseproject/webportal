var nconf = require('nconf');
var path = require('path');

nconf.use('memory');

nconf.set('NODE_ENV', 'development');

nconf.env();

nconf.set('port', 8080);

nconf.set('environment', nconf.get('NODE_ENV'));

nconf.file({
  file: path.join(__dirname, nconf.get('environment') + '.json')
});

module.exports = nconf;