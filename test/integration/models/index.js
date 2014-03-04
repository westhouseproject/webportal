var expect = require('expect.js');

describe('models', function () {
  var models;
  var ALISDevice;
  var User;
  before(function (done) {
    // TODO: find out why `models` is "required" in this `before` call.
    models = require('../../../models');
    ALISDevice = models.ALISDevice;
    User = models.User;
    done();
  });

  describe('sunday', function () {
    it('should get the date the sunday since the given date', function () {
      // The fourth of March, GMT
      var date = new Date(1393891536802);
      expect(models.sunday(date).getTime()).to.be(1393718400000);
    });
  });

  describe('firstOfMonth', function () {
    it('should get the date of the first of the month since the given date', function () {
      // The fourth of March, GMT
      var date = new Date(1393893601767);
      expect(models.firstOfMonth(date).getTime()).to.be(1393632000000);
    });
  });

  describe('firstOfYear', function () {
    it('should get the date of the first of the year since the given date', function () {
      // The fourth of March, GMT
      var date = new Date(1393894857391);
      expect(models.firstOfYear(date).getTime()).to.be(1388534400000);
    });
  });

  var fs = require('fs');
  var path = require('path');

  fs.readdirSync(__dirname).forEach(function (filename) {
    if (filename === 'index.js') { return; }
    require(path.join(__dirname, filename));
  });

});