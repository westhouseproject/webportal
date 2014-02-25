/*
 * An error occures when the user fails to be verified
 */

// TODO: remove this redundant class. It's much better to resolve using a null
//   value to imply that there was an error on the user end, than to return an
//   error as if it was the server. It's not the server's fault, it's the
//   user's
module.exports = VerificationError;
function VerificationError(message) {
  Error.apply(this, arguments);
  this.name = 'VerificationError';
  this.message = message;
  this.verified = false;
}
VerificationError.prototype = Error.prototype;