'use strict';

var execSync = require('child_process').execSync;
var StatsD = require('../lib/statsd');
var assert = require('assert');
var helpers = require('./helpers/helpers.js');

var closeAll = helpers.closeAll;
var testTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

var TIMER_BUFFER = 200;

  describe('#timer', function () {
    var server;
    var statsd;

    afterEach(function (done) {
      closeAll(server, statsd, false, done);
    });

    testTypes().forEach(function([description, serverType, clientType, metricsEnd]) {
      describe(description, function () {

        it('should send stat and time to execute to timing function', function (done) {
          server = createServer(serverType, function (address) {
            statsd = createStatsdClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            var testFn = function (a, b) {
              return a + b;
            };
            statsd.timer(testFn, 'test')(2, 2);
          });
          server.on('metrics', function (metrics) {
            // Search for a string similar to 'test:0.123|ms'
            var re = RegExp("(test:)([0-9]+\.[0-9]+)\\|{1}(ms)");
            assert.equal(true, re.test(metrics));
            done();
          });
        });

        it('should send data with tags to timing function', function (done) {
          server = createServer(serverType, function (address) {
            statsd = createStatsdClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            var testFn = function (a, b) {
              return a + b;
            };
            statsd.timer(testFn, 'test', undefined, ['foo', 'bar'])(2, 2);
          });
          server.on('metrics', function (metrics) {
            // Search for a string similar to 'test:0.123|ms|#foo,bar'
            var re = RegExp("(test:)([0-9]+\.[0-9]+)\\|{1}(ms)\\|{1}\\#(foo,bar)");
            assert.equal(true, re.test(metrics));
            done();
          });
        });
      });
    });

    it('should record "real" time of function call', function () {
      var statsd = new StatsD({mock:true});
      var instrumented = statsd.timer(sleep(100), 'blah');

      instrumented();

      var timeFromStatLine = statsd.mockBuffer[0].match(/blah:(\d+\.\d+)\|/)[1];

      assert.ok(timeFromStatLine >= 99);
      assert.ok(timeFromStatLine < (100 + TIMER_BUFFER));
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
        assert.ok(parseFloat(time) >= 99);
        assert.ok(parseFloat(time) < (100 + TIMER_BUFFER));
      });
    });
  });

function sleep(ms) {
  return function () {
    execSync('sleep ' + (ms / 1000));
  };
}

function delay(n) {
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, n);
  });
}
