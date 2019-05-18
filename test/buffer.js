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
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            maxBufferSize: 12,
            protocol: serverType
          }, clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, 'a:1|c\nb:2|c\n');
          done();
        });
      });

      it('should behave correctly when maxBufferSize is set to zero', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            maxBufferSize: 0,
            protocol: serverType
          }, clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });

        let noOfMessages = 0;
        const expected = ['a:1|c', 'b:2|c'];
        server.on('metrics', metrics => {
          // one of the few places we have an actual test difference based on server type
          if (serverType === 'udp' || serverType === 'uds') {
            const index = expected.indexOf(metrics);
            assert.equal(index >= 0, true);
            expected.splice(index, 1);
            noOfMessages++;
            if (noOfMessages === 2) {
              assert.equal(expected.length, 0);
              done();
            }
          }
          else {
            assert.equal(metrics, 'a:1|c\nb:2|c\n');
            done();
          }
        });
      });

      it('should not send batches larger then maxBufferSize', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            maxBufferSize: 8,
            protocol: serverType
          }, clientType);
          statsd.increment('a', 1);
          statsd.increment('b', 2);
        });
        server.once('metrics', metrics => {
          assert.equal(metrics, 'a:1|c\n');
          done();
        });
      });

      it('should flush the buffer when timeout value elapsed', done => {
        let start;
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            maxBufferSize: 1220,
            bufferFlushInterval: 1100,
            protocol: serverType
          }, clientType);
          start = new Date();
          statsd.increment('a', 1);
        });
        server.on('metrics', metric => {
          const elapsed = Date.now() - start;
          assert.equal(metric, 'a:1|c\n');
          assert.equal(elapsed > 1000, true);
          done();
        });
      });
    });
  });
});
