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

    server = createServer('tcp_broken', opts => {
      statsd = createHotShotsClient(Object.assign(opts, {
        protocol: 'tcp',
        maxBufferSize: 1,
        errorHandler(err) {
          assert.ok(err);
          if (! seenError) {
            seenError = true;
            // do not wait on closing the broken statsd connection
            statsd = null;
            done();
          }
        }
      }), 'client');
      statsd.increment('a', 42, null);
      server.on('metrics', () => {
        assert.ok(false);
      });
    });
  });

  testTypes().forEach(([description, serverType, clientType]) => {
    describe(description, () => {
      it('should not use errorHandler when there is not an error', done => {
        server = createServer(serverType, (opts) => {
          statsd = createHotShotsClient(Object.assign(opts, {
            errorHandler() {
              assert.ok(false);
            }
          }), clientType);
          statsd.increment('a', 42, null);
        });

        server.on('metrics', () => {
          done();
        });
      });

      it('should not use errorHandler when there is not an error and using buffers', done => {
        server = createServer(serverType, opts => {
          statsd = createHotShotsClient(Object.assign(opts, {
            maxBufferSize: 1,
            errorHandler() {
              assert.ok(false);
            }
          }), clientType);
          statsd.increment('a', 42, null);
        });
        server.on('metrics', () => {
          done();
        });
      });

      it('should use errorHandler for sendStat error', done => {
        server = createServer(serverType, opts => {
          const err = new Error('Boom!');
          statsd = createHotShotsClient(Object.assign(opts, {
            errorHandler(e) {
              assert.equal(e, err);
              done();
            }
          }), clientType);
          statsd.sendStat = (item, value, type, sampleRate, tags, callback) => {
            callback(err);
          };
          statsd.sendAll(['test title'], 'another desc');
        });
      });

      it('should use errorHandler for dnsError', done => {
        server = createServer(serverType, opts => {
          const err = new Error('Boom!');
          statsd = createHotShotsClient(Object.assign(opts, {
            errorHandler(e) {
              assert.equal(e, err);
              ignoreErrors = true;
              done();
            }
          }), clientType);
          statsd.dnsError = err;
          statsd.send('test title');
        });
      });

      it('should errback for an unresolvable host', done => {
        // this does not work for tcp/uds, which throws an error during setup
        // that needs errorHandler or a socket.on('error') handler
        if (serverType !== 'udp') {
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
          statsd = null;
          done();
        });
      });

      it('should use errorHandler for an unresolvable host with cacheDns', done => {
        // this does not work for tcp/uds, which throws an error during setup
        // that needs errorHandler or a socket.on('error') handler
        if (serverType !== 'udp') {
          return done();
        }

        statsd = createHotShotsClient({
          host: '...',
          cacheDns: true,
          protocol: serverType,
          errorHandler(error) {
            assert.ok(error);
            assert.equal(error.code, 'ENOTFOUND');
            // skip closing, because the unresolvable host hangs
            statsd = null;
            done();
          }
        }, clientType);
        statsd.send('test title');
      });

      it('should throw error on socket for an unresolvable host', done => {
        // this does not work for tcp/uds, which throws an error during setup
        // that needs errorHandler or a socket.on('error') handler
        if (serverType !== 'udp') {
          return done();
        }

        statsd = createHotShotsClient({
          host: '...',
          protocol: serverType
        }, clientType);

        statsd.socket.on('error', error => {
          assert.ok(error);
          assert.equal(error.code, 'ENOTFOUND');

          // skip closing, because the unresolvable host hangs
          statsd = null;
          done();
        });

        statsd.send('test title');
      });

      if (serverType === 'uds' && clientType === 'client') {
        it('should re-create the socket on 111 error for type uds', (done) => {
          const code = 111;
          const realDateNow = Date.now;
          Date.now = () => '4857394578';
          // emit an error, like a socket would
          // 111 is connection refused
          server = createServer('uds_broken', opts => {
            const client = statsd = createHotShotsClient(Object.assign(opts, {
              protocol: 'uds',
              errorHandler(error) {
                assert.ok(error);
                assert.equal(error.code, code);
              }
            }), 'client');
            const initialSocket = client.socket;
            setTimeout(() => {
              initialSocket.emit('error', { code });
              assert.ok(Object.is(initialSocket, client.socket));
              // it should not create the socket if it breaks too quickly
              // change time and make another error
              Date.now = () => 4857394578 + 1000; // 1 second later
              initialSocket.emit('error', { code });
              setTimeout(() => {
                // make sure the socket was re-created
                assert.notEqual(initialSocket, client.socket);
                // put things back
                Date.now = realDateNow;
                done();
              }, 5);
            }, 5);
          });
        });

        it('should re-create the socket on 107 error for type uds', (done) => {
          const code = 107;
          const realDateNow = Date.now;
          Date.now = () => '4857394578';
          // emit an error, like a socket would
          // 111 is connection refused
          server = createServer('uds_broken', opts => {
            const client = statsd = createHotShotsClient(Object.assign(opts, {
              protocol: 'uds',
              errorHandler(error) {
                assert.ok(error);
                assert.equal(error.code, code);
              }
            }), 'client');
            const initialSocket = client.socket;
            setTimeout(() => {
              initialSocket.emit('error', { code });
              assert.ok(Object.is(initialSocket, client.socket));
              // it should not create the socket if it breaks too quickly
              // change time and make another error
              Date.now = () => 4857394578 + 1000; // 1 second later
              initialSocket.emit('error', { code });
              setTimeout(() => {
                // make sure the socket was re-created
                assert.notEqual(initialSocket, client.socket);
                // put things back
                Date.now = realDateNow;
                done();
              }, 5);
            }, 5);
          });
        });

        it('should re-create the socket on error for type uds with the configurable limit', (done) => {
          const code = 111;
          const limit = 4000;
          const realDateNow = Date.now;
          Date.now = () => '4857394578';
          // emit an error, like a socket would
          // 111 is connection refused
          server = createServer('uds_broken', opts => {
            const client = statsd = createHotShotsClient(Object.assign(opts, {
              protocol: 'uds',
              udsGracefulRestartRateLimit: limit,
              errorHandler(error) {
                assert.ok(error);
                assert.equal(error.code, code);
              }
            }), 'client');
            const initialSocket = client.socket;
            setTimeout(() => {
              initialSocket.emit('error', { code });
              assert.ok(Object.is(initialSocket, client.socket));
              // it should not create the socket if it breaks too quickly
              // change time and make another error
              Date.now = () => 4857394578 + 1000; // 1 second later
              initialSocket.emit('error', { code });
              setTimeout(() => {
                // make sure the socket was NOT re-created
                assert.equal(initialSocket, client.socket);
                Date.now = () => 4857394578 + limit; // 1 second later
                initialSocket.emit('error', { code });
                setTimeout(() => {
                  // make sure the socket was re-created
                  assert.notEqual(initialSocket, client.socket);
                  // put things back
                  Date.now = realDateNow;
                  done();
                }, 5);
              }, 5);
            }, 5);
          });
        });

        it('should not re-create the socket on error for type uds with udsGracefulErrorHandling set to false', (done) => {
          const code = 111;
          const realDateNow = Date.now;
          Date.now = () => '4857394578';
          // emit an error, like a socket would
          // 111 is connection refused
          server = createServer('uds_broken', opts => {
            const client = statsd = createHotShotsClient(Object.assign(opts, {
              protocol: 'uds',
              udsGracefulErrorHandling: false,
              errorHandler(error) {
                assert.ok(error);
                assert.equal(error.code, code);
              }
            }), 'client');
            const initialSocket = client.socket;
            setTimeout(() => {
              initialSocket.emit('error', { code });
              assert.ok(Object.is(initialSocket, client.socket));
              // it should not create the socket anyway if it breaks too quickly
              // change time and make another error
              Date.now = () => 4857394578 + 1000; // 1 second later
              initialSocket.emit('error', { code });
              setTimeout(() => {
                // make sure the socket was NOT re-created
                assert.equal(initialSocket, client.socket);
                // put things back
                Date.now = realDateNow;
                done();
              }, 5);
            }, 5);
          });
        });
      }
    });
  });
});
