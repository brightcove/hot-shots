'use strict';

var assert = require('assert');

var StatsD = require('../lib/statsd');

var createTCPServer = require('./helpers').createTCPServer;
var createUDPServer = require('./helpers').createUDPServer;

module.exports = function runChildClientTestSuite() {
  describe.only('#childClient', function () {
    var server;
    var statsd;

    afterEach(function () {
      server = null;
      statsd = null;
    });

    describe('#init', function () {
      it('should set the proper values when specified', function () {
        statsd = new StatsD(
          'host', 1234, 'prefix', 'suffix', true, null, true, ['gtag', 'tag1:234234']
        );

        var child = statsd.childClient({
          prefix: 'preff.',
          suffix: '.suff',
          globalTags: ['awesomeness:over9000', 'tag1:xxx', 'bar', ':baz']
        });

        assert.equal(child.prefix, 'preff.prefix');
        assert.equal(child.suffix, 'suffix.suff');
        assert.equal(statsd, global.statsd);
        assert.deepEqual(child.globalTags, ['gtag', 'tag1:xxx', 'awesomeness:over9000', 'bar', ':baz']);
      });
    });

    describe('#childClient', function () {
      describe('UDP', function () {
        it('should add tags, prefix and suffix without parent values', function () {
          server = createUDPServer(function (address) {
            statsd = createStatsdClient({
              host: address.host,
              port: address.port,
              maxBufferSize: 500
            }, 0).childClient({
              prefix: 'preff.',
              suffix: '.suff',
              globalTags: ['awesomeness:over9000']
            });
            statsd.increment('a', 1);
            statsd.increment('b', 2);
          });
          server.on('metrics', function (metrics) {
            assert.equal(metrics, 'preff.a.suff:1|c|#awesomeness:over9000\npreff.b.suff:2|c|#awesomeness:over9000\n');
            server.close();
            done();
          });
        });

        it('should add tags, prefix and suffix with parent values', function () {
          server = createUDPServer(function (address) {
            statsd = createStatsdClient({
              host: address.host,
              port: address.port,
              prefix: 'p.',
              suffix: '.s',
              globalTags: ['xyz'],
              maxBufferSize: 500
            }, 0).childClient({
              prefix: 'preff.',
              suffix: '.suff',
              globalTags: ['awesomeness:over9000']
            });
            statsd.increment('a', 1);
            statsd.increment('b', 2);
          });
          server.on('metrics', function (metrics) {
            assert.equal(message, 'preff.p.a.s.suff:1|c|#xyz,awesomeness:' +
              'over9000\npreff.p.b.s.suff:2|c|#xyz,awesomeness:over9000\n'
            );
            server.close();
            done();
          });
        });
      });

      describe('TCP', function () {
        it('should add tags, prefix and suffix without parent values', function () {
          server = createTCPServer(function (address) {
            statsd = createStatsdClient({
              host: address.host,
              port: address.port,
              maxBufferSize: 500,
              protocol: 'tcp'
            }, 0).childClient({
              prefix: 'preff.',
              suffix: '.suff',
              globalTags: ['awesomeness:over9000']
            });
            statsd.increment('a', 1);
            statsd.increment('b', 2);
          });
          server.on('metrics', function (metrics) {
            assert.equal(metrics, 'preff.a.suff:1|c|#awesomeness:over9000\npreff.b.suff:2|c|#awesomeness:over9000\n');
            server.close();
            done();
          });
        });

        it('should add tags, prefix and suffix with parent values', function () {
          server = createTCPServer(function (address) {
            statsd = createStatsdClient({
              host: address.host,
              port: address.port,
              prefix: 'p.',
              suffix: '.s',
              globalTags: ['xyz'],
              maxBufferSize: 500,
              protocol: 'tcp'
            }, 0).childClient({
              prefix: 'preff.',
              suffix: '.suff',
              globalTags: ['awesomeness:over9000']
            });
            statsd.increment('a', 1);
            statsd.increment('b', 2);
          });
          server.on('metrics', function (metrics) {
            assert.equal(message, 'preff.p.a.s.suff:1|c|#xyz,awesomeness:' +
              'over9000\npreff.p.b.s.suff:2|c|#xyz,awesomeness:over9000\n'
            );
            server.close();
            done();
          });
        });
      });
    });
  });
};
