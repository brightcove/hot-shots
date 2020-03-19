const assert = require('assert');
const helpers = require('./helpers/helpers.js');
const dns = require('dns');
const dgram = require('dgram');

const closeAll = helpers.closeAll;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

/**
 * Socket mock constructor.
 * @constructor
 */
function SocketMock() {
  // eslint-disable-next-line no-empty-function
  this.emit = { bind: () => {} };
  // eslint-disable-next-line no-empty-function
  this.on = () => { return { bind: () => {} }; };
  // eslint-disable-next-line no-empty-function
  this.removeListener = { bind: () => {} };
  // eslint-disable-next-line no-empty-function
  this.close = { bind: () => {} };
  // eslint-disable-next-line no-empty-function
  this.unref = { bind: () => {} };
  this.sendCount = 0;
  this.send = (buf, offset, length, port, host, callback) => {
    this.buf = buf;
    this.offset = offset;
    this.length = length;
    this.port = port;
    this.host = host;
    this.sendCount++;
    callback();
  };
}

const mockDgramSocket = () => {
  const socketMock = new SocketMock();
  dgram.createSocket = () => socketMock;
  return socketMock;
};

describe('#udpDnsCacheTransport', () => {
  const udpServerType = 'udp';
  const originalDnsLookup = dns.lookup;
  const originalDgramCreateSocket = dgram.createSocket;
  let server;
  let statsd;

  afterEach(done => {
    dns.lookup = originalDnsLookup;
    dgram.createSocket = originalDgramCreateSocket;
    closeAll(server, statsd, false, done);
  });

  describe('Sending first message', () => {
    it('should lookup dns once', done => {
      server = createServer(udpServerType, opts => {
        const socketMock = mockDgramSocket();

        statsd = createHotShotsClient(Object.assign(opts, {
          cacheDns: true
        }), 'client');

        const resolvedHostAddress = '1.1.1.1';
        let dnsLookupCount = 0;
        dns.lookup = (host, callback) => {
          dnsLookupCount++;
          callback(undefined, resolvedHostAddress);
        };

        statsd.send('test title', {}, (error) => {
          assert.equal(error, undefined);
          setTimeout(() => {
            assert.equal(dnsLookupCount, 1);
            assert.equal(socketMock.sendCount, 1);
            assert.equal(socketMock.host, resolvedHostAddress);
            assert.equal(socketMock.buf, 'test title');
            done();
          }, 1000);
        });
      });
    });
  });

  describe('Sending messages within TTL', () => {
    it('should lookup dns once', done => {
      server = createServer(udpServerType, opts => {
        const socketMock = mockDgramSocket();

        statsd = createHotShotsClient(Object.assign(opts, {
          cacheDns: true
        }), 'client');

        const resolvedHostAddress = '1.1.1.1';
        let dnsLookupCount = 0;
        dns.lookup = (host, callback) => {
          callback(undefined, resolvedHostAddress);
          dnsLookupCount++;
        };

        statsd.send('message', {}, (error) => {
          assert.equal(error, undefined);
        });

        statsd.send('other message', {}, (error) => {
          assert.equal(error, undefined);
          setTimeout(() => {
            assert.equal(dnsLookupCount, 1);
            assert.equal(socketMock.sendCount, 2);
            assert.equal(socketMock.host, resolvedHostAddress);
            done();
          }, 1000);
        });
      });
    });
  });

  describe('Sending messages after TTL expired', () => {
    it('should lookup dns twice', done => {
      server = createServer(udpServerType, opts => {
        const socketMock = mockDgramSocket();

        const cacheDnsTtl = 100;
        statsd = createHotShotsClient(Object.assign(opts, {
          cacheDns: true,
          cacheDnsTtl: cacheDnsTtl
        }), 'client');

        const resolvedHostAddress = '1.1.1.1';
        let dnsLookupCount = 0;
        dns.lookup = (host, callback) => {
          callback(undefined, resolvedHostAddress);
          dnsLookupCount++;
        };

        statsd.send('message', {}, (error) => {
          assert.equal(error, undefined);
        });

        statsd.send('other message', {}, (error) => {
          assert.equal(error, undefined);
        });

        setTimeout(() => {
          statsd.send('message 1ms after TTL', {}, (error) => {
            assert.equal(error, undefined);
            setTimeout(() => {
              assert.equal(dnsLookupCount, 2);
              assert.equal(socketMock.sendCount, 3);
              done();
            }, 1000);
          });
        }, cacheDnsTtl + 1);
      });
    });
  });
});
