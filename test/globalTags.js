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
    delete process.env.DD_ENTITY_ID;
  });

  testTypes().forEach(([description, serverType, clientType, metricEnd]) => {
    describe(description, () => {
      it('should not add global tags if they are not specified', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(opts, clientType);
          statsd.increment('test');
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1|c${metricEnd}`);
          done();
        });
      });

      it('should add global tags if they are specified', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            global_tags: ['gtag'],
          }), clientType);
          statsd.increment('test');
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1|c|#gtag${metricEnd}`);
          done();
        });
      });

      it('should add dd.internal.entity_id tag from DD_ENTITY_ID env var', done => {
        // set the DD_ENTITY_ID env var
        process.env.DD_ENTITY_ID = '04652bb7-19b7-11e9-9cc6-42010a9c016d';

        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            global_tags: ['gtag'],
          }), clientType);
          statsd.increment('test');
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1|c|#gtag,dd.internal.entity_id:04652bb7-19b7-11e9-9cc6-42010a9c016d${metricEnd}`);
          done();
        });
      });

      it('should combine global tags and metric tags', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            global_tags: ['gtag:1', 'gtag:2', 'bar'],
          }), clientType);
          statsd.increment('test', 1337, ['foo']);
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#gtag:1,gtag:2,bar,foo${metricEnd}`);
          done();
        });
      });

      it('should override global tags with metric tags', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            global_tags: ['foo', 'gtag:1', 'gtag:2'],
          }), clientType);
          statsd.increment('test', 1337, ['gtag:234', 'bar']);
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#foo,gtag:234,bar${metricEnd}`);
          done();
        });
      });

      it('should format global tags', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            globalTags: { gtag: '123', foo: 'bar' },
          }), clientType);
          statsd.increment('test', 1337, { gtag: '234' });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#foo:bar,gtag:234${metricEnd}`);
          done();
        });
      });

      it('should format tags using prefix', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            globalTags: { gtag: '123', foo: 'bar' },
            tagPrefix: '~',
          }), clientType);
          statsd.increment('test', 1337, { gtag: '234' });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|~foo:bar,gtag:234${metricEnd}`);
          done();
        });
      });

      it('should format tags using separator', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            globalTags: { gtag: '123', foo: 'bar' },
            tagSeparator: '~',
          }), clientType);
          statsd.increment('test', 1337, { gtag: '234' });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#foo:bar~gtag:234${metricEnd}`);
          done();
        });
      });

      it('should format tags using prefix & separator', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            globalTags: { gtag: '123', foo: 'bar' },
            tagPrefix: '~',
            tagSeparator: '~',
          }), clientType);
          statsd.increment('test', 1337, { gtag: '234' });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|~foo:bar~gtag:234${metricEnd}`);
          done();
        });
      });

      it('should replace reserved characters with underscores in tags', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            globalTags: { foo: 'b,a,r' },
          }), clientType);
          statsd.increment('test', 1337, { 'reserved:character': 'is@replaced@' });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:1337|c|#foo:b_a_r,reserved_character:is_replaced_${metricEnd}`);
          done();
        });
      });

      it('should add global tags using telegraf format when enabled', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            globalTags: ['gtag:gvalue', 'gtag:gvalue2', 'gtag2:gvalue2'],
            telegraf: true,
          }), clientType);
          statsd.increment('test');
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test,gtag=gvalue,gtag=gvalue2,gtag2=gvalue2:1|c${metricEnd}`);
          done();
        });
      });

      it('should combine global tags and metric tags using telegraf format when enabled', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            globalTags: ['gtag=gvalue'],
            telegraf: true,
          }), clientType);
          statsd.increment('test', 1337, ['foo:bar']);
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test,gtag=gvalue,foo=bar:1337|c${metricEnd}`);
          done();
        });
      });

      it('should format global key-value tags using telegraf format when enabled', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            globalTags: { gtag: 'gvalue' },
            telegraf: true,
          }), clientType);
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
