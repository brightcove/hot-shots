const assert = require('assert');
const helpers = require('./helpers/helpers.js');

const closeAll = helpers.closeAll;
const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#send', () => {
  let server;
  let statsd;

  afterEach(done => {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(([description, serverType, clientType]) => {
    describe(description, () => {
      it('should use errorHandler', done => {
        server = createServer(serverType, opts => {
          const err = new Error('Boom!');
          statsd = createHotShotsClient(Object.assign(opts, {
            errorHandler(e) {
              assert.equal(e, err);
              done();
            }
          }), clientType);
          statsd.dnsError = err;
          statsd.send('test title');
        });
      });

      it('should record buffers when mocked', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            mock: true
          }), clientType);
          statsd.send('test', {}, () => {
            assert.deepEqual(statsd.mockBuffer, ['test']);
            done();
          });
        });
      });
    });
  });
});
