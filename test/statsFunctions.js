const assert = require('assert');
const helpers = require('./helpers/helpers.js');

const closeAll = helpers.closeAll;
const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#statsFunctions', () => {
  let server;
  let statsd;

  afterEach(done => {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(([description, serverType, clientType, metricsEnd]) => {
    describe(description, () => {
      [{ name: 'timing', unit: 'ms', bytes: 14 },
       { name: 'histogram', unit: 'h', bytes: 12 },
       { name: 'distribution', unit: 'd', bytes: 12 },
       { name: 'gauge', unit: 'g', bytes: 12 },
       { name: 'set', unit: 's', bytes: 12 },
      ].forEach(statFunction => {

      describe(`#${statFunction.name}`, () => {
          it(`should send proper ${statFunction.name} format without prefix, suffix, sampling and callback`, done => {
            server = createServer(serverType, address => {
              statsd = createHotShotsClient({
                host: address.address,
                port: address.port,
                protocol: serverType
              }, clientType);
              statsd[statFunction.name]('test', 42);
            });
            server.on('metrics', metrics => {
              assert.equal(metrics, `test:42|${statFunction.unit}${metricsEnd}`);
              done();
            });
          });

          it(`should send proper ${statFunction.name} format with tags`, done => {
            server = createServer(serverType, address => {
              statsd = createHotShotsClient({
                host: address.address,
                port: address.port,
                protocol: serverType
              }, clientType);
              statsd[statFunction.name]('test', 42, ['foo', 'bar']);
            });
            server.on('metrics', metrics => {
              assert.equal(metrics, `test:42|${statFunction.unit}|#foo,bar${metricsEnd}`);
              done();
            });
          });

          it(`should send proper ${statFunction.name} format with prefix, suffix, sampling and callback`, done => {
            let called = false;
            server = createServer(serverType, address => {
              statsd = createHotShotsClient({
                host: address.address,
                port: address.port,
                prefix: 'foo.',
                suffix: '.bar',
                protocol: serverType
              }, clientType);
              statsd[statFunction.name]('test', 42, 0.5, () => {
                called = true;
              });
            });
            server.on('metrics', metrics => {
              assert.equal(metrics, `foo.test.bar:42|${statFunction.unit}|@0.5${metricsEnd}`);
              assert.equal(called, true);
              done();
            });
          });

          it('should properly send a and b with the same value', done => {
            let called = 0;
            server = createServer(serverType, address => {
              statsd = createHotShotsClient({
                host: address.address,
                port: address.port,
                protocol: serverType,
                maxBufferSize: 1000,
                bufferFlushInterval: 5
              }, clientType);
              statsd[statFunction.name](['a', 'b'], 42, null, (error) => {
                called += 1;
                assert.ok(called === 1); // Ensure it only gets called once
                assert.equal(error, null);
              });
            });
            server.on('metrics', metrics => {
              assert.equal(metrics, `a:42|${statFunction.unit}\nb:42|${statFunction.unit}\n`);
              done();
            });
          });

          it('should format tags to datadog format by default', done => {
            server = createServer(serverType, address => {
              statsd = createHotShotsClient({
                host: address.address,
                port: address.port,
                protocol: serverType
              }, clientType);
              statsd[statFunction.name]('test', 42, { foo: 'bar' });
            });
            server.on('metrics', metrics => {
              assert.equal(metrics, `test:42|${statFunction.unit}|#foo:bar${metricsEnd}`);
              done();
            });
          });

          it('should format tags when using telegraf format', done => {
            server = createServer(serverType, address => {
              statsd = createHotShotsClient({
                host: address.address,
                port: address.port,
                telegraf: true,
                protocol: serverType
              }, clientType);
              statsd[statFunction.name]('test', 42, { foo: 'bar' });
            });
            server.on('metrics', metrics => {
              assert.equal(metrics, `test,foo=bar:42|${statFunction.unit}${metricsEnd}`);
              done();
            });
          });
        });
      });

      describe('#increment', () => {
        it('should send count by 1 when no params are specified', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.increment('test');
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:1|c${metricsEnd}`);
            done();
          });
        });

        it('should use when increment is 0', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.increment('test', 0);
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:0|c${metricsEnd}`);
            done();
          });
        });

        it('should send proper count format with tags', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.increment('test', 42, ['foo', 'bar']);
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:42|c|#foo,bar${metricsEnd}`);
            done();
          });
        });

        it('should send default count 1 with tags', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.increment('test', ['foo', 'bar']);
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:1|c|#foo,bar${metricsEnd}`);
            done();
          });
        });

        it('should send tags when sampleRate is omitted', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.increment('test', 23, ['foo', 'bar']);
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:23|c|#foo,bar${metricsEnd}`);
            done();
          });
        });

        it('should send proper count format with prefix, suffix, sampling and callback', done => {
          let called = false;
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              prefix: 'foo.',
              suffix: '.bar',
              protocol: serverType
            }, clientType);
            statsd.increment('test', 42, 0.5, () => {
              called = true;
            });
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `foo.test.bar:42|c|@0.5${metricsEnd}`);
            assert.equal(called, true);
            done();
          });
        });

        it('should properly send a and b with the same value', done => {
          let called = 0;
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType,
              maxBufferSize: 1000,
              bufferFlushInterval: 5
            }, clientType);
            statsd.increment(['a', 'b'], 42, null, (error, bytes) => {
              called += 1;
              assert.ok(called === 1); // Ensure it only gets called once
              assert.equal(error, null);
              assert.equal(bytes, 0);
            });
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, 'a:42|c\nb:42|c\n');
            done();
          });
        });
      });

      describe('#decrement', () => {
        it('should send count by -1 when no params are specified', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.decrement('test');
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:-1|c${metricsEnd}`);
            done();
          });
        });

        it('should send default count -1 with tags', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.decrement('test', ['foo', 'bar']);
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:-1|c|#foo,bar${metricsEnd}`);
            done();
          });
        });

        it('should send tags when sampleRate is omitted', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.decrement('test', 23, ['foo', 'bar']);
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:-23|c|#foo,bar${metricsEnd}`);
            done();
          });
        });

        it('should send proper count format with tags', done => {
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType
            }, clientType);
            statsd.decrement('test', 42, ['foo', 'bar']);
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `test:-42|c|#foo,bar${metricsEnd}`);
            done();
          });
        });

        it('should send proper count format with prefix, suffix, sampling and callback', done => {
          let called = false;
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              prefix: 'foo.',
              suffix: '.bar',
              protocol: serverType
            }, clientType);
            statsd.decrement('test', 42, 0.5, () => {
              called = true;
            });
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, `foo.test.bar:-42|c|@0.5${metricsEnd}`);
            assert.equal(called, true);
            done();
          });
        });

        it('should properly send a and b with the same value', done => {
          let called = 0;
          server = createServer(serverType, address => {
            statsd = createHotShotsClient({
              host: address.address,
              port: address.port,
              protocol: serverType,
              maxBufferSize: 1000,
              bufferFlushInterval: 5
            }, clientType);
            statsd.decrement(['a', 'b'], 42, null, (error, bytes) => {
              called += 1;
              assert.ok(called === 1); // Ensure it only gets called once
              assert.equal(error, null);
              assert.equal(bytes, 0);
            });
          });
          server.on('metrics', metrics => {
            assert.equal(metrics, 'a:-42|c\nb:-42|c\n');
            done();
          });
        });
      });
    });
  });
});
