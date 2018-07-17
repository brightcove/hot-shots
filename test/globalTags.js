'use strict';

var assert = require('assert');
var helpers = require('./helpers/helpers.js');

var closeAll = helpers.closeAll;
var testTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#globalTags', function () {
  var server;
  var statsd;

  afterEach(function (done) {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(function([description, serverType, clientType, metricEnd]) {
    describe(description, function () {
      it('should not add global tags if they are not specified', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.increment('test');
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test:1|c' + metricEnd);
          done();
        });
      });

      it('should add global tags if they are specified', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            global_tags: ['gtag'],
            protocol: serverType
          }, clientType);
          statsd.increment('test');
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test:1|c|#gtag' + metricEnd);
          done();
        });
      });

      it('should combine global tags and metric tags', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            global_tags: ['gtag'],
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, ['foo']);
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test:1337|c|#gtag,foo' + metricEnd);
          done();
        });
      });

      it('should override global tags with metric tags', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            global_tags: ['foo', 'gtag:123'],
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, ['gtag:234', 'bar']);
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test:1337|c|#foo,gtag:234,bar' + metricEnd);
          done();
        });
      });

      it('should format global tags', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            globalTags: { gtag: "123", foo: "bar"},
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, { gtag: "234"});
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test:1337|c|#gtag:234,foo:bar' + metricEnd);
          done();
        });
      });

      it('should replace reserved characters with underscores in tags', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            globalTags: { foo: "b,a,r"},
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, { "reserved:character": "is@replaced@"});
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test:1337|c|#foo:b_a_r,reserved_character:is_replaced_' + metricEnd);
          done();
        });
      });

      it('should add global tags using telegraf format when enabled', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            globalTags: ['gtag:gvalue', 'gtag2:gvalue2'],
            telegraf: true,
            protocol: serverType
          }, clientType);
          statsd.increment('test');
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test,gtag=gvalue,gtag2=gvalue2:1|c' + metricEnd);
          done();
        });
      });

      it('should combine global tags and metric tags using telegraf format when enabled', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            globalTags: ['gtag=gvalue'],
            telegraf: true,
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, ['foo:bar']);
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test,gtag=gvalue,foo=bar:1337|c' + metricEnd);
          done();
        });
      });

      it('should format global key-value tags using telegraf format when enabled', function (done) {
        server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.address,
            port: address.port,
            globalTags: { gtag: "gvalue"},
            telegraf: true,
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, { foo: "bar" });
        });
        server.on('metrics', function (metrics) {
          assert.equal(metrics, 'test,gtag=gvalue,foo=bar:1337|c' + metricEnd);
          done();
        });
      });
    });
  });
});
