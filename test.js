var sinon = require('sinon');
var expect = require('expect.js');

describe('unit tests', function () {
  describe('middlewares', function () {
  })
});

describe('integration tests', function () {
  describe('models', function () {
    describe('User', function () {
      describe('creation', function () {
        describe('email address', function () {
          it('should accept valid email addresses', function (done) {
            var user = User.create({
              username: ''
            })
          });

          it('should reject invalid email addresses', function (done) {

          });
        })
        it('should hash the password upon creation', function () {

        })
      });
      describe('findByCredentials', function () {
        it('should get a user based on the username')
      });
    });
  });
});