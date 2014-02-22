describe('Reading', function () {
  var user;
  var device;
  beforeEach(function (done) {
    sequelize.sync({
      force: true
    }).complete(function (err) {
      if (err) { throw err; }
      models.User.create({
        username: 'validusername',
        email_address: 'valid@example.com',
        password: 'keyboardcat'
      }).complete(function (err, u) {
        if (err) { throw err; }
        user = u;
        user.verify(
          user.verification_code,
          user.email_address
        ).then(function (u) {
          user = u;
          user.createALISDevice().complete(function (err, d) {
            device = d;
            done();
          });
        }).catch(function (err) {
          throw err;
        })
      })
    })
  });

  // TODO: test whether or not the correct energy consumers are returned.
  // TODO: test the data that is being read from two different ALIS devices.

  describe('bulkCreate', function () {
    xit('initialize new energy consumer rows given consumer ids that don\'t match anything on record', function (done) {
      models.ReadPoint.findAll({}).complete(function (err, consumers) {
        if (err) { throw err; }
        expect(consumers.length).to.be(0);
        models.ReadPoint.bulkCreate({
          time: new Date(),
          uuid_token: device.uuid_token,
          client_secret: device.client_secret,
          energy_consumptions: [
            {
              id: '1',
              kw: 0.1231,
              kwh: 0.32432,
            },
            {
              id: '2',
              kw: 1.342,
              kwh: 2.4234
            },
            {
              id: '3',
              kw: 0.0234,
              kwh: 0.14234
            }
          ]
        }).then(function (readings) {
          expect(readings.length).to.be(3);
          models.EnergyConsumer.findAll({}).complete(function (err, consumers) {
            expect(consumers.length).to.be(3);
            done();
          });
        }).catch(function (err) {
          throw err;
        });
      });
    });

    xit('should reject requests, if the provided ALIS device UUID token and client secret don\'t anything on record', function (done) {
      throw new Error('Not yet spec\'d');
    })
  });
});