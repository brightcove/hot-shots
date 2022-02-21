const assert = require('assert');
const helpers = require('./helpers/helpers.js');

const closeAll = helpers.closeAll;
const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#buffer', () => {
  let server;
  let statsd;

  afterEach(done => {
    closeAll(server, statsd, false, done);
    server = null;
    statsd = null;
  });

  testTypes().forEach(([description, serverType, clientType]) => {
    describe(description, () => {
      it('should aggregate packets when maxBufferSize is set to non-zero', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            maxBufferSize: 12,
          }), clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });
        server.on('metrics', metrics => {
          assert.strictEqual(metrics, 'a:1|c\nb:2|c\n');
          done();
        });
      });

      it('should behave correctly when maxBufferSize is set to zero', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            maxBufferSize: 0,
          }), clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });

        let noOfMessages = 0;
        const expected = ['a:1|c', 'b:2|c'];
        server.on('metrics', metrics => {
          // one of the few places we have an actual test difference based on server type
          if (serverType === 'udp' || serverType === 'uds' || serverType === 'stream') {
            const index = expected.indexOf(metrics.trim());
            assert.strictEqual(index >= 0, true);
            expected.splice(index, 1);
            noOfMessages++;
            if (noOfMessages === 2) {
              assert.strictEqual(expected.length, 0);
              done();
            }
          }
          else {
            assert.strictEqual(metrics, 'a:1|c\nb:2|c\n');
            done();
          }
        });
      });

      it('should not send batches larger then maxBufferSize', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            maxBufferSize: 5,
          }), clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });
        server.once('metrics', metrics => {
          assert.strictEqual(metrics, 'a:1|c\n');
          done();
        });
      });

      it('should flush the buffer when timeout value elapsed', done => {
        let start;
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            maxBufferSize: 1220,
            bufferFlushInterval: 1100,
          }), clientType);
          start = new Date();
          statsd.increment('a', 1);
        });
        server.on('metrics', metric => {
          const elapsed = Date.now() - start;
          assert.strictEqual(metric, 'a:1|c\n');
          assert.strictEqual(elapsed > 1000, true);
          done();
        });
      });
    });
  });
});
