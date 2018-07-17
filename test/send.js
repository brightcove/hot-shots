'use strict';

var assert = require('assert');
var helpers = require('./helpers/helpers.js');

var closeAll = helpers.closeAll;
var testTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#send', function () {
  var server;
  var statsd;

  afterEach(function (done) {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(function([description, serverType, clientType]) {
    describe(description, function () {
      it('should use errorHandler', function (done) {
        server = createServer(serverType, function (address) {
          var err = new Error('Boom!');
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            errorHandler: function (e) {
              assert.equal(e, err);
              done();
            }
          }, clientType);
          statsd.dnsError = err;
          statsd.send('test title');
        });
      });

      it('should record buffers when mocked', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            mock: true
          }, clientType);
          statsd.send('test', {}, function() {
            assert.deepEqual(statsd.mockBuffer, ['test']);
            done();
          });
        });
      });
    });
  });
});
