const assert = require('assert');
const helpers = require('./helpers/helpers.js');

const closeAll = helpers.closeAll;
const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#globalTags', () => {
  let server;
  let statsd;

  afterEach(done => {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(([description, serverType, clientType, metricEnd]) => {
    describe(description, () => {
      it('should not add global tags if they are not specified', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.increment('test');
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1|c${metricEnd}`);
          done();
        });
      });

      it('should add global tags if they are specified', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            global_tags: ['gtag'],
            protocol: serverType
          }, clientType);
          statsd.increment('test');
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1|c|#gtag${metricEnd}`);
          done();
        });
      });

      it('should combine global tags and metric tags', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            global_tags: ['gtag'],
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, ['foo']);
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#gtag,foo${metricEnd}`);
          done();
        });
      });

      it('should override global tags with metric tags', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            global_tags: ['foo', 'gtag:123'],
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, ['gtag:234', 'bar']);
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#foo,gtag:234,bar${metricEnd}`);
          done();
        });
      });

      it('should format global tags', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            globalTags: { gtag: '123', foo: 'bar' },
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, { gtag: '234' });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#gtag:234,foo:bar${metricEnd}`);
          done();
        });
      });

      it('should replace reserved characters with underscores in tags', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            globalTags: { foo: 'b,a,r' },
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, { 'reserved:character': 'is@replaced@' });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#foo:b_a_r,reserved_character:is_replaced_${metricEnd}`);
          done();
        });
      });

      it('should add global tags using telegraf format when enabled', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            globalTags: ['gtag:gvalue', 'gtag2:gvalue2'],
            telegraf: true,
            protocol: serverType
          }, clientType);
          statsd.increment('test');
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test,gtag=gvalue,gtag2=gvalue2:1|c${metricEnd}`);
          done();
        });
      });

      it('should combine global tags and metric tags using telegraf format when enabled', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            globalTags: ['gtag=gvalue'],
            telegraf: true,
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, ['foo:bar']);
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test,gtag=gvalue,foo=bar:1337|c${metricEnd}`);
          done();
        });
      });

      it('should format global key-value tags using telegraf format when enabled', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            globalTags: { gtag: 'gvalue' },
            telegraf: true,
            protocol: serverType
          }, clientType);
          statsd.increment('test', 1337, { foo: 'bar' });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test,gtag=gvalue,foo=bar:1337|c${metricEnd}`);
          done();
        });
      });
    });
  });
});
