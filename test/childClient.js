'use strict';

var assert = require('assert');
var helpers = require('./helpers/helpers.js');

var StatsD = require('../lib/statsd');

var closeAll = helpers.closeAll;
var testProtocolTypes = helpers.testTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#childClient', function () {
  var server;
  var statsd;

  afterEach(function(done) {
    closeAll(server, statsd, false, done);
  });

  testProtocolTypes().forEach(function([description, serverType, clientType]) {

    describe(description, function () {
      it('init should set the proper values when specified', function () {
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

    it('childClient should add tags, prefix and suffix without parent values', function (done) {
      server = createServer(serverType, function (address) {
          statsd = createStatsdClient({
            host: address.host,
            port: address.port,
            maxBufferSize: 500,
            protocol: serverType
          }, clientType).childClient({
            prefix: 'preff.',
            suffix: '.suff',
            globalTags: ['awesomeness:over9000']
          });
          statsd.increment('a', 1);
          statsd.increment('b', 2);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'preff.a.suff:1|c|#awesomeness:over9000\npreff.b.suff:2|c|#awesomeness:over9000\n');
        done();
      });
    });

    it('should add tags, prefix and suffix with parent values', function (done) {
      server = createServer(serverType, function (address) {
        statsd = createStatsdClient({
          host: address.host,
          port: address.port,
          prefix: 'p.',
          suffix: '.s',
          globalTags: ['xyz'],
          maxBufferSize: 500,
          protocol: serverType
        }, clientType).childClient({
          prefix: 'preff.',
          suffix: '.suff',
          globalTags: ['awesomeness:over9000']
        });
        statsd.increment('a', 1);
        statsd.increment('b', 2);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'preff.p.a.s.suff:1|c|#xyz,awesomeness:' +
          'over9000\npreff.p.b.s.suff:2|c|#xyz,awesomeness:over9000\n'
        );
        done();
      });
    });
  });
});
