'use strict';

var assert = require('assert');
var dgram = require('dgram');
var net = require('net');

var createStatsdClient = require('./helpers').createStatsdClient;
var createTCPServer = require('./helpers').createTCPServer;
var createUDPServer = require('./helpers').createUDPServer;

module.exports = function runTimingTestSuite() {
  describe('#timing', function () {
    var server;
    var statsd;

    afterEach(function () {
      server = null;
      statsd = null;
    });

    ['main client', 'child client', 'child of child client'].forEach(function (description, index) {
      describe(description, function () {
        describe('UDP', function () {
          it('should send proper time format without prefix, suffix, sampling and callback', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
              }, index);
              statsd.timing('test', 42);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'test:42|ms');
              server.close();
              done();
            });
          });

          it('should send proper time format with tags', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
              }, index);
              statsd.timing('test', 42, ['foo', 'bar']);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'test:42|ms|#foo,bar');
              server.close();
              done();
            });
          });

          it('should send proper time format with prefix, suffix, sampling and callback', function (done) {
            var called = false;
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                prefix: 'foo.',
                suffix: '.bar'
              }, index);
              statsd.timing('test', 42, 0.5, function () {
                called = true;
              });
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'foo.test.bar:42|ms|@0.5');
              assert.equal(called, true);
              server.close();
              done();
            });
          });

          it('should properly send a and b with the same value', function (done) {
            var called = 0;
            var noOfMessages = 0;
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port
              });
              statsd.timing(['a', 'b'], 42, null, function (error, bytes) {
                called += 1;
                assert.ok(called === 1); // Ensure it only gets called once
                assert.equal(error, null);
                assert.equal(bytes, 14);
              });
            });
            server.on('metrics', function (metric) {
              if (noOfMessages === 0) {
                assert.equal(metric, 'a:42|ms');
                noOfMessages += 1;
              } else {
                assert.equal(metric, 'b:42|ms');
                server.close();
                done();
              }
            });
          });

          it('should send no timing stat when a mock Client is used', function (done) {
            var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
            server = createUDPServer(function (address) {
              statsd = createStatsdClient([
                address.address, address.port, 'prefix', 'suffix', false, false, true
              ], index);

              // Regression test for "undefined is not a function" with missing
              // callback on mock instance
              statsd.timing('test', 1);

              statsd.timing('test', 1, null, function (error, bytes) {
                var socket = dgram.createSocket("udp4");
                var buf = new Buffer(TEST_FINISHED_MESSAGE);

                assert.ok(!error);
                assert.equal(bytes, 0);
                // We should call finished() here, but we have to work around
                // https://github.com/joyent/node/issues/2867 on node 0.6,
                // such that we don't close the socket within the `listening` event
                // and pass a single message through instead.
                socket.send(buf, 0, buf.length, address.port, address.address, function () {
                  socket.close();
                });
              });
            });
            server.on('metrics', function (message) {
              // We only expect to get our own test finished message, no stats
              assert.equal(message, TEST_FINISHED_MESSAGE);
              server.close();
              done();
            });
          });

          it('should format tags to datadog format by default', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port
              });
              statsd.timing('test', 42, {foo: 'bar'});
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'test:42|ms|#foo:bar');
              server.close();
              done();
            });
          });

          it('should format tags when using telegraf format', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                telegraf: true
              });
              statsd.timing('test', 42, { foo: 'bar'});
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'test,foo=bar:42|ms');
              server.close();
              done();
            });
          });
        });

        describe('TCP', function () {
          it('should send proper time format without prefix, suffix, sampling and callback', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp'
              }, index);
              statsd.timing('test', 42);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'test:42|ms\n');
              server.close();
              done();
            });
          });

          it('should send proper time format with tags', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp'
              }, index);
              statsd.timing('test', 42, ['foo', 'bar']);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'test:42|ms|#foo,bar\n');
              server.close();
              done();
            });
          });

          it('should send proper time format with prefix, suffix, sampling and callback', function (done) {
            var called = false;
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                prefix: 'foo.',
                suffix: '.bar',
                protocol: 'tcp'
              }, index);
              statsd.timing('test', 42, 0.5, function () {
                called = true;
              });
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'foo.test.bar:42|ms|@0.5\n');
              assert.equal(called, true);
              server.close();
              done();
            });
          });

          it('should properly send a and b with the same value', function (done) {
            var called = 0;
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp'
              });
              statsd.timing(['a', 'b'], 42, null, function (error, bytes) {
                called += 1;
                assert.ok(called === 1); // Ensure it only gets called once
                assert.equal(error, null);
                assert.equal(bytes, 0);
              });
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'a:42|ms\nb:42|ms\n');
              server.close();
              done();
            });
          });

          it('should send no timing stat when a mock Client is used', function (done) {
            var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address,
                port: address.port,
                prefix: 'prefix',
                suffix: 'suffix',
                mock: true,
                protocol: 'tcp'
              }, index);

              // Regression test for "undefined is not a function" with missing
              // callback on mock instance
              statsd.timing('test', 1);

              statsd.timing('test', 1, null, function (error, bytes) {
                var socket = net.connect(address.port, address.address);
                var buf = new Buffer(TEST_FINISHED_MESSAGE);

                assert.ok(!error);
                assert.equal(bytes, 0);
                // We should call finished() here, but we have to work around
                // https://github.com/joyent/node/issues/2867 on node 0.6,
                // such that we don't close the socket within the `listening` event
                // and pass a single message through instead.
                socket.write(buf, 0, 'ascii', function () {
                  socket.close();
                });
              });
            });
            server.on('metrics', function (message) {
              // We only expect to get our own test finished message, no stats
              assert.equal(message, TEST_FINISHED_MESSAGE);
              server.close();
              done();
            });
          });

          it('should format tags to datadog format by default', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp'
              });
              statsd.timing('test', 42, {foo: 'bar'});
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'test:42|ms|#foo:bar\n');
              server.close();
              done();
            });
          });

          it('should format tags when using telegraf format', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                telegraf: true,
                protocol: 'tcp'
              });
              statsd.timing('test', 42, { foo: 'bar'});
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'test,foo=bar:42|ms\n');
              server.close();
              done();
            });
          });
        });
      });
    });
  });
};
