'use strict';

var assert = require('assert');
var helpers = require('./helpers/helpers.js');

var closeAll = helpers.closeAll;
var testTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#check', function () {
  var server;
  var statsd;

  afterEach(function (done) {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(function([description, serverType, clientType, metricEnd]) {
    describe(description, function () {
      it('should send proper check format for name and status', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.check('check.name', statsd.CHECKS.OK);
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_sc|check.name|0' + metricEnd);
          done();
        });
      });

      it('should send proper check format for name and status with global prefix and suffix', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            prefix: 'prefix.',
            suffix: '.suffix',
            protocol: serverType
          }, clientType);
          statsd.check('check.name', statsd.CHECKS.OK);
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_sc|prefix.check.name.suffix|0' + metricEnd);
          done();
        });
      });

      it('should send proper check format for name, status, and options', function (done) {
        var date = new Date();
        server = createServer(serverType, function (address) {
          var options;
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          options = {
            date_happened: date,
            hostname: 'host',
            message: 'message'
          };
          statsd.check('check.name', statsd.CHECKS.WARNING, options);
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_sc|check.name|1|d:' +
            Math.round(date.getTime() / 1000) + '|h:host|m:message' + metricEnd
          );
          done();
        });
      });

      it('should send proper check format for title, text, some options, and tags', function (done) {
        server = createServer(serverType, function (address) {
          var options;
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          options = {
            hostname: 'host'
          };
          statsd.event('test title', 'another desc', options, ['foo', 'bar']);
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_e{10,12}:test title|another desc|h:host|#foo,bar' + metricEnd);
          done();
        });
      });

      it('should send proper check format for title, text, tags, and a callback', function (done) {
        var called = false;
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.check('check.name', statsd.CHECKS.OK, null, ['foo', 'bar'], function () {
            called = true;
          });
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_sc|check.name|0|#foo,bar' + metricEnd);
          assert.equal(called, true);
          done();
        });
      });

      it('should send no event stat when a mock Client is used', function (done) {
        var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            prefix: 'prefix',
            suffix: 'suffix',
            mock: true,
            protocol: serverType
          }, clientType);

          // Regression test for "undefined is not a function" with missing
          // callback on mock instance
          statsd.check('test', 1);

          statsd.check('test', 1, null, function (error, bytes) {
            done();
          });
        });
        server.on('metrics', function (message) {
          assert.ok(false, 'No metrics should be seen');
        });
      });

      it('should throw an exception when using telegraf format', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            telegraf: true,
            protocol: serverType
          }, clientType);
          assert.throws(function () {
            statsd.check('check.name', statsd.CHECKS.OK, null, ['foo', 'bar']);
          }, function (err) {
            done();
          });
        });
      });

      it('should use errorHandler', function (done) {
        var calledDone = false;
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            telegraf: true,
            protocol: serverType,
            errorHandler: function () {
              if (! calledDone) {
                calledDone = true;
                done();
              }
            }
          }, clientType);
          statsd.check('check.name', statsd.CHECKS.OK);
        });
      });
    });
  });
});
