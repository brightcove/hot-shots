'use strict';

var assert = require('assert');
var helpers = require('./helpers/helpers.js');

var closeAll = helpers.closeAll;
var testTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#errorHandling', function () {
  var server;
  var statsd;

  testTypes().forEach(function([description, serverType, clientType]) {
    describe(description, function () {

      it('should use errorHandler for sendStat error', function (done) {
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
          statsd.sendStat = function (item, value, type, sampleRate, tags, callback) {
            callback(err);
          };
          statsd.sendAll(['test title'], 'another desc');
        });
      });

      it('should use errorHandler', function (done) {
        server = createServer(serverType, function (address) {
          var err = new Error('Boom!');
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            errorHandler: function (e) {
              assert.equal(e, err);
              closeAll(server, statsd, true, done);
            }
          }, clientType);
          statsd.dnsError = err;
          statsd.send('test title');
        });
      });

      it('should errback for an unresolvable host', function (done) {
        // this does not work for tcp, which throws an error during setup
        // that needs errorHandler or a socket.on('error') handler
        if (serverType === 'tcp') {
          return done();
        }

       statsd = createStatsdClient({
          host: '...',
          protocol: serverType
        }, clientType);

        statsd.send('test title', [], function (error) {
          assert.ok(error);
          assert.equal(error.code, 'ENOTFOUND');
          // skip closing, because the unresolvable host hangs
          done();
        });
      });

      it('should use errorHandler for an unresolvable host', function (done) {
        statsd = createStatsdClient({
          host: '...',
          protocol: serverType,
          errorHandler: function (e) {
            assert.ok(e);
            assert.equal(e.code, 'ENOTFOUND');
            // skip closing, because the unresolvable host hangs
            done();
          }
        }, clientType);
        statsd.send('test title');
      });

      it('should throw error on socket for an unresolvable host', function (done) {
        statsd = createStatsdClient({
          host: '...',
          protocol: serverType
        }, clientType);

        statsd.socket.on('error', function (error) {
          assert.ok(error);
          assert.equal(error.code, 'ENOTFOUND');
          // skip closing, because the unresolvable host hangs
          done();
        });

        statsd.send('test title');
      });
    });
  });
});
