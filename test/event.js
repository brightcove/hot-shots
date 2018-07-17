'use strict';

var assert = require('assert');
var helpers = require('./helpers/helpers.js');

var closeAll = helpers.closeAll;
var testTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#event', function () {
  var server;
  var statsd;

  afterEach(function (done) {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(function([description, serverType, clientType, metricEnd]) {
    describe(description, function () {
      it('should send proper event format for title and text', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.event('test', 'description');
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_e{4,11}:test|description' + metricEnd);
          done();
        });
      });

      it('should reuse the title when when text is missing', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.event('test');
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_e{4,4}:test|test' + metricEnd);
          done();
        });
      });

      it('should send proper event format for title, text, and options', function (done) {
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
            aggregation_key: 'ag_key',
            priority: 'low',
            source_type_name: 'source_type',
            alert_type: 'warning'
          };
          statsd.event('test title', 'another\nmultiline\ndescription', options);
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_e{10,31}:test title|another\\nmultiline\\ndescription|d:' +
            Math.round(date.getTime() / 1000) + '|h:host|k:ag_key|p:low|s:source_type|t:warning' + metricEnd
          );
          done();
        });
      });

      it('should send proper event format for title, text, some options, and tags', function (done) {
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

      it('should send proper event format for title, text, tags, and a callback', function (done) {
        var called = false;
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.event('test title', 'another desc', null, ['foo', 'bar'], function () {
            called = true;
          });
        });
        server.on('metrics', function (event) {
          assert.equal(event, '_e{10,12}:test title|another desc|#foo,bar' + metricEnd);
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
          statsd.event('test', 1);

          statsd.event('test', 1, null, function (error, bytes) {
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
            statsd.event('test title', 'another desc', null, ['foo', 'bar']);
          }, function (err) {
            done();
          });
        });
      });

      it('should use errorHandler', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            telegraf: true,
            protocol: serverType,
            errorHandler: function () {
              done();
            }
          }, clientType);
          statsd.event('test title', 'another desc');
        });
      });
    });
  });
});
