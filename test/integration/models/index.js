describe('models', function () {
  var models;
  var ALISDevice;
  var User;
  before(function (done) {
    models = require('../../../models');
    ALISDevice = models.ALISDevice;
    User = models.User;
    done();
  });

  var fs = require('fs');
  var path = require('path');

  fs.readdirSync(__dirname).forEach(function (filename) {
    if (filename === 'index.js') { return; }
    require(path.join(__dirname, filename));
  });

});