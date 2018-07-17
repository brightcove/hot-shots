'use strict';

var helpers = require('./helpers/helpers.js');

var testTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#close', function () {
  var server;
  var statsd;

  testTypes().forEach(function([description, serverType, clientType, metricsEnd]) {
    describe(description, function () {
      it('should call callback after close call', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.close(function () {
            server.close();
            done();
          });
        });
      });

      it('should use errorHandler on close issue', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            errorHandler: function (e) {
              server.close();
              done();
            }
          }, clientType);
          statsd.socket.destroy = function () {
            throw new Error('Boom!');
          };
          statsd.socket.close = statsd.socket.destroy;
          statsd.close();
        });
      });
    });
  });
});
