const assert = require('assert');
const helpers = require('./helpers/helpers.js');

const closeAll = helpers.closeAll;
const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#errorHandling', () => {
  let server;
  let statsd;

  testTypes().forEach(([description, serverType, clientType]) => {
    describe(description, () => {

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
              closeAll(server, statsd, true, done);
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
          // skip closing, because the unresolvable host hangs
          done();
        });

        statsd.send('test title');
      });
    });
  });
});
