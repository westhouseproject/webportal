var Sequelize = require('sequelize');
var fs = require('fs');
var expect = require('expect.js');
var validator = require('validator');
var uuid = require('node-uuid');
var async = require('async');
var bcrypt = require('bcrypt');
var sequelize = require('../../models').seq;

var settings = {};
try {
  settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
} catch (e) {}

// TODO: nest all model tests into another describe call.

describe('integration tests', function () {
  var fs = require('fs');
  var path = require('path');

  fs.readdirSync(__dirname).forEach(function (filename) {
    if (filename === 'index.js') { return; }
    require(path.join(__dirname, filename));
  });
});
