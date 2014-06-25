var _ = require('lodash');

/*
 * Represents an error that occurs after determining that a set of inputs are
 * invalid for inserting into the database.
 */

module.exports = ValidationErrors;
function ValidationErrors(err) {
  var finalMessage = [];
  this.name = 'ValidationErrors';
  Object.keys(err).forEach(function (key) {
    finalMessage.push(key + ': ' + err[key]);
  });
  this.message = finalMessage.join('\n');
  this.fields = err;
  _.assign(this, err);
}
ValidationErrors.prototype = Error.prototype;