const assert = require('assert');
const helpers = require('./helpers/helpers.js');

const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#close', () => {
  let server;
  let statsd;

  testTypes().forEach(([description, serverType, clientType, metricsEnd]) => {
    describe(description, () => {
      it('should call callback after close call', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.close(() => {
            server.close();
            done();
          });
        });
      });

      it('should send metrics before close call', done => {
        let metricSeen = false;
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          statsd.set('test', 42);
          statsd.close(() => {
            // give the metric a bit of time to get handled by the server
            const serverClose = setInterval(() => {
              server.close();
              clearInterval(serverClose);
              assert.ok(metricSeen, 'Metric was not seen as expected');
              done();
            }, 100);
          });
        });
        server.on('metrics', metrics => {
          assert.equal(metrics, `test:42|s${metricsEnd}`);
          metricSeen = true;
        });
      });

      it('should send metric before close call when buffering enabled', done => {
        let metricSeen = false;
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            maxBufferSize: 1
          }, clientType);
          statsd.set('test', 42);
          statsd.close(() => {
            // give the metric a bit of time to get handled by the server
            const serverClose = setInterval(() => {
              server.close();
              clearInterval(serverClose);
              assert.ok(metricSeen, 'Metric was not seen as expected');
              done();
            }, 100);
          });
        });
        server.on('metrics', metrics => {
          // this uses '\n' instead of metricsEnd because that's how things are set up when
          // maxBufferSize is in use
          assert.equal(metrics, 'test:42|s\n');
          metricSeen = true;
        });
      });

      it('should send metric before close call when buffered', done => {
        let metricSeen = false;
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            maxBufferSize: 5000
          }, clientType);
          statsd.set('test', 42);
          statsd.close(() => {
            // give the metric a bit of time to get handled by the server
            const serverClose = setInterval(() => {
              server.close();
              clearInterval(serverClose);
              assert.ok(metricSeen, 'Metric was not seen as expected');
              done();
            }, 100);
          });
        });
        server.on('metrics', metrics => {
          // this uses '\n' instead of metricsEnd because that's how things are set up when
          // maxBufferSize is in use
          assert.equal(metrics, 'test:42|s\n');
          metricSeen = true;
        });
      });

      it('should use errorHandler on close issue', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            errorHandler() {
              server.close();
              done();
            }
          }, clientType);
          statsd.socket.destroy = () => {
            throw new Error('Boom!');
          };
          statsd.socket.close = statsd.socket.destroy;
          statsd.close();
        });
      });
    });
  });
});
