/*
 * An error occures when the user has been authorized.
 */

// TODO: remove this redundant class. It's much better to resolve using a null
//   value to imply that there was an error on the user end, than to return an
//   error as if it was the server. It's not the server's fault, it's the
//   user's
module.exports = UnauthorizedError
function UnauthorizedError(message) {
  Error.apply(this, arguments);
  this.name = 'UnauthorizedError';
  this.message = message;
  this.unauthorized = true;
}
UnauthorizedError.prototype = Error.prototype;