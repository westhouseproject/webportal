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
          expect(next.called).to.be(false);
        }
      );

      it(
        'should not redirect if the user is already on `/account`',
        function () {
          var req = {
            path: '/account',
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
  })
});