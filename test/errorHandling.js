const assert = require('assert');
const os = require('os');
const process = require('process');
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
      setTimeout(() => {
        // give a small delay to ensure errorHandler is setup
        statsd.increment('a', 42, null);
      }, 50);
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
            errorHandler(err) {
              console.log('Error handler called with:', err);
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
              assert.strictEqual(e, err);
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
              assert.strictEqual(e, err);
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
          assert.strictEqual(error.code, 'ENOTFOUND');
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
            assert.strictEqual(error.code, 'ENOTFOUND');
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
          assert.strictEqual(error.code, 'ENOTFOUND');

          // skip closing, because the unresolvable host hangs
          statsd = null;
          done();
        });

        statsd.send('test title');
      });

      if (serverType === 'tcp' && clientType === 'client' && process.platform !== 'win32') {
        describe('#tcpSocket', () => {

          // ensure we restore the original `Date.now` after each test
          const realDateNow = Date.now;
          afterEach(() => {
            Date.now = realDateNow;
          });

          it('should re-create the socket on bad connection error for type tcp', (done) => {
            const code = badTCPConnectionCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('tcp', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'tcp',
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
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
                  done();
                }, 5);
              }, 5);
            });
          });

          it('should re-create the socket on bad descriptor error for type tcp', (done) => {
            const code = badTCPDescriptorCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('tcp', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'tcp',
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
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
                  done();
                }, 5);
              }, 5);
            });
          });

          it('should re-create the socket on error for type tcp with the configurable limit', (done) => {
            const code = badTCPConnectionCode();
            const limit = 4000;
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('tcp', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'tcp',
                tcpGracefulRestartRateLimit: limit,
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
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
                  assert.strictEqual(initialSocket, client.socket);
                  Date.now = () => 4857394578 + limit; // 1 second later
                  initialSocket.emit('error', { code });
                  setTimeout(() => {
                    // make sure the socket was re-created
                    assert.notEqual(initialSocket, client.socket);
                    done();
                  }, 5);
                }, 5);
              }, 5);
            });
          });

          it('should re-create the socket on bad descriptor error when sending metric', (done) => {
            const code = badTCPDescriptorCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('tcp', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'tcp',
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
                }
              }), 'client');
              const initialSocket = client.socket;
              // mock send function on the initial socket
              initialSocket.send = (_, callback) => {
                callback({ code });
              };
              setTimeout(() => {
                client.increment('metric.name');
                assert.ok(Object.is(initialSocket, client.socket));
                // it should not create the socket if it breaks too quickly
                // change time and make another error
                Date.now = () => 4857394578 + 1000; // 1 second later
                client.increment('metric.name');
                setTimeout(() => {
                  // make sure the socket was re-created
                  assert.notEqual(initialSocket, client.socket);
                  done();
                }, 5);
              }, 5);
            });
          });

          it('should re-create the socket on bad descriptor error when sending metric with a callback', (done) => {
            const code = badTCPDescriptorCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('tcp', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'tcp',
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
                }
              }), 'client');
              const initialSocket = client.socket;
              // mock send function on the initial socket
              initialSocket.send = (_, callback) => {
                callback({ code });
              };
              setTimeout(() => {
                client.increment('metric.name', error => {
                  assert.strictEqual(error.code, code);
                  assert.ok(Object.is(initialSocket, client.socket));
                  // it should not create the socket if it breaks too quickly
                  // change time and make another error
                  Date.now = () => 4857394578 + 1000; // 1 second later
                  client.increment('metric.name', anotherError => {
                    assert.strictEqual(anotherError.code, code);
                    setTimeout(() => {
                      // make sure the socket was re-created
                      assert.notEqual(initialSocket, client.socket);
                      done();
                    }, 5);
                  });
                });
              }, 5);
            });
          });

          it('should not re-create the socket on error for type tcp with tcpGracefulErrorHandling set to false', (done) => {
            const code = badTCPConnectionCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('tcp', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'tcp',
                tcpGracefulErrorHandling: false,
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
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
                  assert.strictEqual(initialSocket, client.socket);
                  done();
                }, 5);
              }, 5);
            });
          });
        });
      }

      if (serverType === 'uds' && clientType === 'client') {
        describe('#udsSocket', () => {

          // ensure we restore the original `Date.now` after each test
          const realDateNow = Date.now;
          afterEach(() => {
            Date.now = realDateNow;
          });

          it('should re-create the socket on bad connection error for type uds', (done) => {
            const code = badUDSConnectionCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('uds_broken', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'uds',
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
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
                  done();
                }, 5);
              }, 5);
            });
          });

          it('should re-create the socket on bad descriptor error for type uds', (done) => {
            const code = badUDSDescriptorCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('uds_broken', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'uds',
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
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
                  done();
                }, 5);
              }, 5);
            });
          });

          it('should re-create the socket on error for type uds with the configurable limit', (done) => {
            const code = badUDSConnectionCode();
            const limit = 4000;
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('uds_broken', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'uds',
                udsGracefulRestartRateLimit: limit,
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
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
                  assert.strictEqual(initialSocket, client.socket);
                  Date.now = () => 4857394578 + limit; // 1 second later
                  initialSocket.emit('error', { code });
                  setTimeout(() => {
                    // make sure the socket was re-created
                    assert.notEqual(initialSocket, client.socket);
                    done();
                  }, 5);
                }, 5);
              }, 5);
            });
          });

          it('should re-create the socket on bad descriptor error when sending metric', (done) => {
            const code = badUDSDescriptorCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('uds_broken', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'uds',
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
                }
              }), 'client');
              const initialSocket = client.socket;
              // mock send function on the initial socket
              initialSocket.send = (_, callback) => {
                callback({ code });
              };
              setTimeout(() => {
                client.increment('metric.name');
                assert.ok(Object.is(initialSocket, client.socket));
                // it should not create the socket if it breaks too quickly
                // change time and make another error
                Date.now = () => 4857394578 + 1000; // 1 second later
                client.increment('metric.name');
                setTimeout(() => {
                  // make sure the socket was re-created
                  assert.notEqual(initialSocket, client.socket);
                  done();
                }, 5);
              }, 5);
            });
          });

          it('should re-create the socket on bad descriptor error when sending metric with a callback', (done) => {
            const code = badUDSDescriptorCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('uds_broken', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'uds',
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
                }
              }), 'client');
              const initialSocket = client.socket;
              // mock send function on the initial socket
              initialSocket.send = (_, callback) => {
                callback({ code });
              };
              setTimeout(() => {
                client.increment('metric.name', error => {
                  assert.strictEqual(error.code, code);
                  assert.ok(Object.is(initialSocket, client.socket));
                  // it should not create the socket if it breaks too quickly
                  // change time and make another error
                  Date.now = () => 4857394578 + 1000; // 1 second later
                  client.increment('metric.name', anotherError => {
                    assert.strictEqual(anotherError.code, code);
                    setTimeout(() => {
                      // make sure the socket was re-created
                      assert.notEqual(initialSocket, client.socket);
                      done();
                    }, 5);
                  });
                });
              }, 5);
            });
          });

          it('should not re-create the socket on error for type uds with udsGracefulErrorHandling set to false', (done) => {
            const code = badUDSConnectionCode();
            Date.now = () => '4857394578';
            // emit an error, like a socket would
            server = createServer('uds_broken', opts => {
              const client = statsd = createHotShotsClient(Object.assign(opts, {
                protocol: 'uds',
                udsGracefulErrorHandling: false,
                errorHandler(error) {
                  assert.ok(error);
                  assert.strictEqual(error.code, code);
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
                  assert.strictEqual(initialSocket, client.socket);
                  done();
                }, 5);
              }, 5);
            });
          });
        });
      }
    });
  });
});

/**
 * Return system error code for a "bad connection" to a TCP (e.g. does not
 * exist).
 *
 * The value is negated because of the way errors are returned, e.g. by `libuv`.
 *
 * - 111 (ECONNREFUSED) on Linux
 * - 54 (ECONNRESET) on macOS
 * - "not-implemented" on other platforms
 */
 function badTCPConnectionCode() {
  if (process.platform === 'linux') {
    return -os.constants.errno.ECONNREFUSED;
  }

  if (process.platform === 'darwin') {
    return -os.constants.errno.ECONNRESET;
  }

  return 'not-implemented';
}

/**
 * Return system error code for a "bad connection" to a UDS (e.g. does not
 * exist).
 *
 * The value is negated because of the way errors are returned, e.g. by `libuv`.
 *
 * - 111 (ECONNREFUSED) on Linux
 * - 54 (ECONNRESET) on macOS
 * - "not-implemented" on other platforms
 */
function badUDSConnectionCode() {
  if (process.platform === 'linux') {
    return -os.constants.errno.ECONNREFUSED;
  }

  if (process.platform === 'darwin') {
    return -os.constants.errno.ECONNRESET;
  }

  return 'not-implemented';
}

/**
 * Return system error code for a "bad descriptor" (e.g. descriptor exists
 * but server is gone).
 *
 * The value is negated because of the way errors are returned, e.g. by `libuv`.
 *
 * - 107 (ENOTCONN) on Linux
 * - 39 (EDESTADDRREQ) on macOS
 * - "not-implemented" on other platforms
 */
 function badTCPDescriptorCode() {
  if (process.platform === 'linux') {
    return -os.constants.errno.ENOTCONN;
  }

  if (process.platform === 'darwin') {
    return -os.constants.errno.EDESTADDRREQ;
  }

  return 'not-implemented';
}

/**
 * Return system error code for a "bad descriptor" (e.g. descriptor exists
 * but server is gone).
 *
 * The value is negated because of the way errors are returned, e.g. by `libuv`.
 *
 * - 107 (ENOTCONN) on Linux
 * - 39 (EDESTADDRREQ) on macOS
 * - "not-implemented" on other platforms
 */
function badUDSDescriptorCode() {
  if (process.platform === 'linux') {
    return -os.constants.errno.ENOTCONN;
  }

  if (process.platform === 'darwin') {
    return -os.constants.errno.EDESTADDRREQ;
  }

  return 'not-implemented';
}
