var nodemailer = require('nodemailer');
var settings = require('../../settings');

/*
 * Used for mailing things out to users.
 */

module.exports = nodemailer.createTransport(
  settings.get('mailer:type'),
  settings.get('mailer:options')
);