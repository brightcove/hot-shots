const helpers = require('./helpers/helpers.js');

const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#close', () => {
  let server;
  let statsd;

  testTypes().forEach(([description, serverType, clientType]) => {
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
