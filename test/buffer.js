'use strict';

var assert = require('assert');
var helpers = require('./helpers/helpers.js');

var closeAll = helpers.closeAll;
var testTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#buffer', function () {
  var server;
  var statsd;

  afterEach(function (done) {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(function([description, serverType, clientType]) {
    describe(description, function () {
      it('should aggregate packets when maxBufferSize is set to non-zero', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            maxBufferSize: 12,
            protocol: serverType
          }, clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'a:1|c\nb:2|c\n');
          done();
        });
      });

      it('should behave correctly when maxBufferSize is set to zero', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            maxBufferSize: 0,
            protocol: serverType
          }, clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });

        var noOfMessages = 0;
        var expected = ['a:1|c', 'b:2|c'];
        server.on('metrics', function (metrics) {
          // one of the few places we have an actual test difference based on server type
          if (serverType === 'udp') {
            var index = expected.indexOf(metrics);
            assert.equal(index >= 0, true);
            expected.splice(index, 1);
            noOfMessages++;
            if (noOfMessages === 2) {
              assert.equal(expected.length, 0);
              done();
            }
          }
          else {
            assert.equal(metrics, 'a:1|c\nb:2|c\n');
            done();
          }
        });
      });

      it('should not send batches larger then maxBufferSize', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            maxBufferSize: 8,
            protocol: serverType
          }, clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });
        server.once('metrics', function (metrics) {
          assert.equal(metrics, 'a:1|c\n');
          done();
        });
      });

      it('should flush the buffer when timeout value elapsed', function (done) {
        var start;
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            maxBufferSize: 1220,
            bufferFlushInterval: 1100,
            protocol: serverType
          }, clientType);
          start = new Date();
          statsd.increment('a', 1);
        });
        server.on('metrics', function (metric) {
          var elapsed = Date.now() - start;
          assert.equal(metric, 'a:1|c\n');
          assert.equal(elapsed > 1000, true);
          done();
        });
      });
    });
  });
});
