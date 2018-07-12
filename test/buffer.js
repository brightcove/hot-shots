'use strict';

var assert = require('assert');

var createStatsdClient = require('./helpers').createStatsdClient;
var createTCPServer = require('./helpers').createTCPServer;
var createUDPServer = require('./helpers').createUDPServer;

module.exports = function runBufferTestSuite() {
  describe('#buffer', function () {
    var server;
    var statsd;

    afterEach(function () {
      server = null;
      statsd = null;
    });

    ['main client', /*'child client', 'child of child client'*/].forEach(function (description, index) {
      describe(description, function () {
        describe('UDP', function () {
          it('should aggregate packets when maxBufferSize is set to non-zero', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                maxBufferSize: 12
              }, index);
              statsd.increment('a', 1);
              statsd.increment('b', 2);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'a:1|c\nb:2|c\n');
              server.close();
              done();
            });
          });

          it('should not aggregate packets when maxBufferSize is set to zero', function (done) {
            var noOfMessages = 0;
            var expected = ['a:1|c', 'b:2|c'];
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                maxBufferSize: 0
              }, index);
              statsd.increment('a', 1);
              statsd.increment('b', 2);
            });
            server.on('metrics', function (metric) {
              var index = expected.indexOf(metric);
              assert.equal(index >= 0, true);
              expected.splice(index, 1);
              noOfMessages++;
              if (noOfMessages === 2) {
                assert.equal(expected.length, 0);
                server.close();
                done();
              }
            });
          });

          it('should not send batches larger then maxBufferSize', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                maxBufferSize: 8
              }, index);
              statsd.increment('a', 1);
              statsd.increment('b', 2);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'a:1|c\n');
              server.close();
              done();
            });
          });

          it('should flush the buffer when timeout value elapsed', function (done) {
            var start;
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                maxBufferSize: 1220,
                bufferFlushInterval: 1100
              }, index);
              start = new Date();
              statsd.increment('a', 1);
            });
            server.on('metrics', function (metric) {
              var elapsed = Date.now() - start;
              assert.equal(metric, 'a:1|c\n');
              assert.equal(elapsed > 1000, true);
              server.close();
              done();
            });
          });
        });

        describe('TCP', function () {
          it('should aggregate packets when maxBufferSize is set to non-zero', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                maxBufferSize: 12,
                protocol: 'tcp'
              }, index);
              statsd.increment('a', 1);
              statsd.increment('b', 2);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'a:1|c\nb:2|c\n');
              server.close();
              done();
            });
          });

          it('should aggregate packets when maxBufferSize is set to zero', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                maxBufferSize: 0,
                protocol: 'tcp'
              }, index);
              statsd.increment('a', 1);
              statsd.increment('b', 2);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'a:1|c\nb:2|c\n');
              server.close();
              done();
            });
          });

          it('should not send batches larger then maxBufferSize', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                maxBufferSize: 8,
                protocol: 'tcp'
              }, index);
              statsd.increment('a', 1);
              statsd.increment('b', 2);
            });
            server.on('metrics', function (metrics) {
              assert.equal(metrics, 'a:1|c\n');
              statsd.close();
              server.close();
              done();
            });
          });

          it('should flush the buffer when timeout value elapsed', function (done) {
            var start;
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                maxBufferSize: 1220,
                bufferFlushInterval: 1100,
                protocol: 'tcp'
              }, index);
              start = new Date();
              statsd.increment('a', 1);
            });
            server.on('metrics', function (metric) {
              var elapsed = Date.now() - start;
              assert.equal(metric, 'a:1|c\n');
              assert.equal(elapsed > 1000, true);
              server.close();
              done();
            });
          });
        });
      });
    });
  });
};
