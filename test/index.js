var fs = require('fs');
var path = require('path');

fs.readdirSync(__dirname).forEach(function (filename) {
  if (filename === 'index.js') { return; }
  require(path.join(__dirname, filename));
});