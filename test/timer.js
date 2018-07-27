'use strict';
var StatsD = require('../lib/statsd');
var assert = require('assert');

var createStatsdClient = require('./helpers').createStatsdClient;
var createTCPServer = require('./helpers').createTCPServer;
var createUDPServer = require('./helpers').createUDPServer;

module.exports = function runTimerTestSuite() {
  describe('#timer', function () {
    var server;
    var statsd;

    afterEach(function () {
      server = null;
      statsd = null;
    });

    ['main client', 'child client', 'child of child client'].forEach(function (description, index) {
      describe(description, function () {
        describe('UDP', function () {
          it('should send stat and time to execute to timing function', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port
              }, index);
              var testFn = function (a, b) {
                return a + b;
              };
              statsd.timer(testFn, 'test')(2, 2);
            });
            server.on('metrics', function (metrics) {
              // Search for a string similar to 'test:0.123|ms'
              var re = RegExp("(test:)([0-9]+\.[0-9]+)\\|{1}(ms)");
              assert.equal(true, re.test(metrics));
              server.close();
              done();
            });
          });

          it('should send data with tags to timing function', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port
              }, index);
              var testFn = function (a, b) {
                return a + b;
              };
              statsd.timer(testFn, 'test', undefined, ['foo', 'bar'])(2, 2);
            });
            server.on('metrics', function (metrics) {
              // Search for a string similar to 'test:0.123|ms|#foo,bar'
              var re = RegExp("(test:)([0-9]+\.[0-9]+)\\|{1}(ms)\\|{1}\\#(foo,bar)");
              assert.equal(true, re.test(metrics));
              server.close();
              done();
            });
          });
        });

        describe('TCP', function () {
          it('should send stat and time to execute to timing function', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp'
              }, index);
              var testFn = function (a, b) {
                return a + b;
              };
              statsd.timer(testFn, 'test')(2, 2);
            });
            server.on('metrics', function (metrics) {
              // Search for a string similar to 'test:0.123|ms'
              var re = RegExp("(test:)([0-9]+\.[0-9]+)\\|{1}(ms)");
              assert.equal(true, re.test(metrics));
              server.close();
              done();
            });
          });

          it('should send data with tags to timing function', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp'
              }, index);
              var testFn = function (a, b) {
                return a + b;
              };
              statsd.timer(testFn, 'test', undefined, ['foo', 'bar'])(2, 2);
            });
            server.on('metrics', function (metrics) {
              // Search for a string similar to 'test:0.123|ms|#foo,bar'
              var re = RegExp("(test:)([0-9]+\.[0-9]+)\\|{1}(ms)\\|{1}\\#(foo,bar)");
              assert.equal(true, re.test(metrics));
              server.close();
              done();
            });
          });
        });
      });
    });

    it('should record "user time" of promise', function () {
      /* globals Promise */
      var statsd = new StatsD({mock:true});

      var onehundredMsFunc = function () { return delay(100); };

      var instrumented = statsd.asyncTimer(onehundredMsFunc, 'name-thingy');

      return instrumented().then(function() {

        var stat = statsd.mockBuffer[0];
        var name = stat.split(/:|\|/)[0];
        var time = stat.split(/:|\|/)[1];

        assert.equal(name, 'name-thingy');
        assert.ok(parseFloat(time) >= 100);
        assert.ok(parseFloat(time) < 200);
      });
    });
  });
};


function delay(n) {
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, n);
  });
}
