const assert = require('assert');
const helpers = require('./helpers/helpers.js');
const dns = require('dns');
const dgram = require('dgram');

const closeAll = helpers.closeAll;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

describe('#udpSocketOptions', () => {
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

  it('should use custom DNS lookup function', done => {
    const resolvedHostAddress = '127.0.0.1';
    let dnsLookupCount = 0;
    const customDnsLookup = (host, options, callback) => {
      dnsLookupCount++;
      callback(undefined, resolvedHostAddress);
    };

    server = createServer(udpServerType, opts => {
      statsd = createHotShotsClient(Object.assign(opts, {
        cacheDns: true,
        udpSocketOptions: {
          type: 'udp4',
          lookup: customDnsLookup,
        },
      }), 'client');

      statsd.send('test title', {}, (error) => {
        assert.strictEqual(error, null);
        setTimeout(() => {
          assert.strictEqual(dnsLookupCount, 2);
          done();
        }, 1000);
      });
    });
  });
});
