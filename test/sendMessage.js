'use strict';

var assert = require('assert');
var domain = require('domain');

var createStatsdClient = require('./helpers').createStatsdClient;
var createTCPServer = require('./helpers').createTCPServer;
var createUDPServer = require('./helpers').createUDPServer;

module.exports = function runSendMessageMethodTestSuite() {
  describe('#sendMessage', function () {
    var server;
    var statsd;

    afterEach(function () {
      server = null;
      statsd = null;
    });

    ['main client', 'child client', 'child of child client'].forEach(function (description, index) {
      describe(description, function () {
        describe('UDP', function () {
          it('should use errorHandler', function (done) {
            server = createUDPServer(function (address) {
              var err = new Error('Boom!');
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                errorHandler: function (e) {
                  assert.equal(e, err);
                  done();
                }
              }, index);
              statsd.dnsError = err;
              statsd.send('test title');
            });
          });

          it('should errback for an unresolvable host', function (done) {
            statsd = createStatsdClient({ host: '...' });
            statsd.send('test title', [], function (error) {
              assert.ok(error);
              assert.equal(error.code, 'ENOTFOUND');
              done();
            });
          });

          it('should use errorHandler for an unresolvable host', function (done) {
            statsd = createStatsdClient({
              host: '...',
              errorHandler: function (error) {
                assert.ok(error);
                assert.equal(error.code, 'ENOTFOUND');
                done();
              }
            });
            statsd.send('test title');
          });

          it('should throw for an unresolvable host', function (done) {
            var d = domain.create();
            statsd = createStatsdClient({ host: '...' });
      
            d.add(statsd.socket);
            d.on('error', function (error) {
              assert.ok(error);
              assert.equal(error.code, 'ENOTFOUND');
              // Important to exit the domain or further tests will continue to run
              // therein.
              d.exit();
              done();
            });
      
            d.run(function () { statsd.send('test title'); });
          });
        });

        describe('TCP', function () {
          it('should use errorHandler', function (done) {
            server = createTCPServer(function (address) {
              var err = new Error('Boom!');
              statsd = createStatsdClient({
                host: address.address,
                port: address.port,
                protocol: 'tcp',
                errorHandler: function (e) {
                  assert.equal(e, err);
                  done();
                }
              }, index);
              statsd.dnsError = err;
              statsd.send('test title');
            });
          });

          it.skip('should errback for an unresolvable host', function () {
            // This one blows up on socket.on('error') level and cannot be
            // catched inside the statsd.send callback. This case is the
            // same as above.
          });

          it('should use errorHandler for an unresolvable host', function (done) {           
            statsd = createStatsdClient({
              host: '...',
              protocol: 'tcp',
              errorHandler: function (e) {
                assert.ok(e);
                assert.equal(e.code, 'ENOTFOUND');
                done();
              }
            }, index);
            statsd.send('test title');
          });

          it('should throw for an unresolvable host', function (done) {
            var d = domain.create();
            statsd = createStatsdClient({
              host: '...',
              protocol: 'tcp'
            });
      
            d.add(statsd.socket);
            d.on('error', function (error) {
              assert.ok(error);
              assert.equal(error.code, 'ENOTFOUND');
              // Important to exit the domain or further tests will continue to run
              // therein.
              d.exit();
              done();
            });
      
            d.run(function () { statsd.send('test title'); });
          });
        });
      });
    });
  });
};
