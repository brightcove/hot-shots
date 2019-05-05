const assert = require('assert');
const helpers = require('./helpers/helpers.js');

const closeAll = helpers.closeAll;
const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#errorHandling', () => {
  let server;
  let statsd;
  let ignoreErrors;

  afterEach(done => {
    closeAll(server, statsd, ignoreErrors, () => {
      ignoreErrors = false;
      server = null;
      statsd = null;
      done();
    });
  });

  // we have some tests first outside of the normal testTypes() setup as we want to
  // test with a broken server, which is just set up with tcp

  it('should use errorHandler when server is broken and using buffers', done => {
    // sometimes two errors show up, one with the initial connection
    let seenError = false;

    server = createServer('tcp_broken', address => {
      statsd = createHotShotsClient({
        host: address.address,
        port: address.port,
        protocol: 'tcp',
        maxBufferSize: 1,
        errorHandler(err) {
          assert.ok(err);
          if (! seenError) {
            seenError = true;
            done();
          }
        }
      }, 'client');
      statsd.increment('a', 42, null);
      server.on('metrics', () => {
        assert.ok(false);
      });
    });
  });

  testTypes().forEach(([description, serverType, clientType]) => {
    describe(description, () => {
      it('should not use errorHandler when there is not an error', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            errorHandler() {
              assert.ok(false);
            }
          }, clientType);
        });
        statsd.increment('a', 42, null);
        server.on('metrics', () => {
          done();
        });
      });

      it('should not use errorHandler when there is not an error and using buffers', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            maxBufferSize: 1,
            errorHandler() {
              assert.ok(false);
            }
          }, clientType);
        });
        statsd.increment('a', 42, null);
        server.on('metrics', () => {
          done();
        });
      });

      it('should use errorHandler for sendStat error', done => {
        server = createServer(serverType, address => {
          const err = new Error('Boom!');
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            errorHandler(e) {
              assert.equal(e, err);
              done();
            }
          }, clientType);
          statsd.sendStat = (item, value, type, sampleRate, tags, callback) => {
            callback(err);
          };
          statsd.sendAll(['test title'], 'another desc');
        });
      });

      it('should use errorHandler', done => {
        server = createServer(serverType, address => {
          const err = new Error('Boom!');
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType,
            errorHandler(e) {
              assert.equal(e, err);
              ignoreErrors = true;
              done();
            }
          }, clientType);
          statsd.dnsError = err;
          statsd.send('test title');
        });
      });

      it('should errback for an unresolvable host', done => {
        // this does not work for tcp, which throws an error during setup
        // that needs errorHandler or a socket.on('error') handler
        if (serverType === 'tcp') {
          return done();
        }

       statsd = createHotShotsClient({
          host: '...',
          protocol: serverType
        }, clientType);

        statsd.send('test title', [], error => {
          assert.ok(error);
          assert.equal(error.code, 'ENOTFOUND');
          // skip closing, because the unresolvable host hangs
          done();
        });
      });

      it('should use errorHandler for an unresolvable host', done => {
        statsd = createHotShotsClient({
          host: '...',
          protocol: serverType,
          errorHandler(e) {
            assert.ok(e);
            assert.equal(e.code, 'ENOTFOUND');
            // skip closing, because the unresolvable host hangs
            done();
          }
        }, clientType);
        statsd.send('test title');
      });

      it('should throw error on socket for an unresolvable host', done => {
        statsd = createHotShotsClient({
          host: '...',
          protocol: serverType
        }, clientType);

        statsd.socket.on('error', error => {
          assert.ok(error);
          assert.equal(error.code, 'ENOTFOUND');
          statsd.close();
          done();
        });

        statsd.send('test title');
      });
    });
  });
});
