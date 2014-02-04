var sinon = require('sinon');
var expect = require('expect.js');

describe('unit tests', function () {
  describe('middlewares', function () {
    describe('ensureEmail', function () {
      var ensureEmail = require('./middlewares').ensureEmail;

      it('should not redirect if the user is not logged in', function () {
        var req = {
          isAuthenticated: function () {
            return false;
          }
        };
        var res = {
          redirect: sinon.spy()
        };
        var next = sinon.spy();

        ensureEmail(req, res, next);

        expect(res.redirect.called).to.be(false);
        expect(next.called).to.be(true);
      });

      it(
        'should not redirect if the user has a valid email address',
        function () {
          var req = {
            isAuthenticated: function () {
              return true;
            },
            user: {
              email_address: 'sample@example.com'
            }
          };
          var res = {
            redirect: sinon.spy()
          };
          var next = sinon.spy();

          ensureEmail(req, res, next);

          expect(res.redirect.called).to.be(false);
          expect(next.called).to.be(true);
        }
      );

      it(
        'should redirect if the user has an invalid email address',
        function () {
          var req = {
            isAuthenticated: function () {
              return true;
            },
            user: {
              email_address: ''
            }
          };
          var res = {
            redirect: sinon.spy()
          };
          var next = sinon.spy();

          ensureEmail(req, res, next);

          expect(res.redirect.called).to.be(true);
          expect(res.redirect.args[0][0]).to.be('/new-email');
          expect(next.called).to.be(false);
        }
      );

      it(
        'should not redirect if the user is already on `/new-email`',
        function () {
          var req = {
            path: '/new-email',
            isAuthenticated: function () {
              return true;
            },
            user: {
              email_address: ''
            }
          };
          var res = {
            redirect: sinon.spy()
          };
          var next = sinon.spy();

          ensureEmail(req, res, next);

          expect(res.redirect.called).to.be(false);
          expect(next.called).to.be(true);
        }
      )
    });

    describe('ensureNoEmail', function () {
      var ensureNoEmail = require('./middlewares').ensureNoEmail;

      it('should redirect away if the user already has a valid email address', function () {
        var req = {
          user: {
            email_address: 'sample@example.com'
          }
        };
        var res = {
          redirect: sinon.spy()
        };
        var next = sinon.spy();

        ensureNoEmail(req, res, next);

        expect(res.redirect.called).to.be(true);
        expect(res.redirect.args[0][0]).to.be('/account');
        expect(next.called).to.be(false);
      });

      it('should not redirect if the user does not already have a valid email address', function () {
        var req = {
          user: {
            email_address: ''
          }
        };
        var res = {
          redirect: sinon.spy()
        };
        var next = sinon.spy();

        ensureNoEmail(req, res, next);

        expect(res.redirect.called).to.be(false);
        expect(next.called).to.be(true);
      });
    });
  })
});

describe('integration tests', function () {
  describe('models', function () {
    describe('ALISDevice', function () {
      describe('creation', function () {
        it('should initialize a new uuid_token, without explicitly specifying', function () {
          
        });
      });
    });
  });
});