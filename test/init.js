'use strict';

var assert = require('assert');
var dgram = require('dgram');
var dns = require('dns');
var net = require('net');

var StatsD = require('../lib/statsd');
var helpers = require('./helpers/helpers.js');

var closeAll = helpers.closeAll;
var testProtocolTypes = helpers.testProtocolTypes;
var createServer = helpers.createServer;
var createStatsdClient = helpers.createStatsdClient;

describe('#init', function () {
  var server;
  var statsd;
  var skipClose = false;
  var clientType = 'client';

  afterEach(function (done) {
    if (skipClose) {
      done();
    }
    else {
      closeAll(server, statsd, false, done);
    }
    global.statsd = undefined;
    skipClose = false;
  });

  it('should set the proper values when specified', function () {
    // cachedDns isn't tested here, hence the null
    var statsd = createStatsdClient(
      ['host', 1234, 'prefix', 'suffix', true, null, true, ['gtag'], 0, 60, false, 0.5, 'udp'],
      clientType
    );

    assert.equal(statsd.host, 'host');
    assert.equal(statsd.port, 1234);
    assert.equal(statsd.prefix, 'prefix');
    assert.equal(statsd.suffix, 'suffix');
    assert.equal(statsd, global.statsd);
    assert.equal(statsd.mock, true);
    assert.deepEqual(statsd.globalTags, ['gtag']);
    assert.equal(statsd.maxBufferSize, 0);
    assert.equal(statsd.bufferFlushInterval, 60);
    assert.equal(statsd.telegraf, false);
    assert.equal(statsd.sampleRate, 0.5);
    assert.equal(statsd.protocol, 'udp');
  });

  it('should set the proper values with options hash format', function () {
    // Don't do DNS lookup for this test
    var originalLookup = dns.lookup;
    dns.lookup = function () {};

    // cachedDns isn't tested here, hence the null
    var statsd = createStatsdClient({
      host: 'host',
      port: 1234,
      prefix: 'prefix',
      suffix: 'suffix',
      globalize: true,
      mock: true,
      globalTags: ['gtag'],
      sampleRate: 0.6,
      maxBufferSize: 0,
      bufferFlushInterval: 60,
      telegraf: false,
      protocol: 'tcp'
    }, clientType);

    assert.equal(statsd.host, 'host');
    assert.equal(statsd.port, 1234);
    assert.equal(statsd.prefix, 'prefix');
    assert.equal(statsd.suffix, 'suffix');
    assert.equal(statsd, global.statsd);
    assert.equal(statsd.mock, true);
    assert.equal(statsd.sampleRate, 0.6);
    assert.deepEqual(statsd.globalTags, ['gtag']);
    assert.equal(statsd.maxBufferSize, 0);
    assert.equal(statsd.bufferFlushInterval, 60);
    assert.deepEqual(statsd.telegraf, false);
    assert.equal(statsd.protocol, 'tcp');

    dns.lookup = originalLookup;
  });

  it('should set default values when not specified', function () {
    var statsd = createStatsdClient({}, clientType);
    assert.equal(statsd.host, 'localhost');
    assert.equal(statsd.port, 8125);
    assert.equal(statsd.prefix, '');
    assert.equal(statsd.suffix, '');
    assert.equal(global.statsd, undefined);
    assert.equal(statsd.mock, undefined);
    assert.deepEqual(statsd.globalTags, []);
    assert.ok(!statsd.mock);
    assert.equal(statsd.sampleRate, 1);
    assert.equal(statsd.maxBufferSize, 0);
    assert.equal(statsd.bufferFlushInterval, 1000);
    assert.equal(statsd.telegraf, false);
    assert.equal(statsd.protocol, undefined); // Defaults to UDP
  });

  it('should map global_tags to globalTags for backwards compatibility', function () {
    var statsd = createStatsdClient({ global_tags: ['gtag'] }, clientType);
    assert.deepEqual(statsd.globalTags, ['gtag']);
  });

  it('should attempt to cache a dns record if dnsCache is specified', function (done) {
    var originalLookup = dns.lookup;
    var statsd;

    // Replace the dns lookup function with our mock dns lookup
    dns.lookup = function (host, callback) {
      process.nextTick(function( ) {
        dns.lookup = originalLookup;
        assert.equal(statsd.host, host);
        callback(null, '127.0.0.1', 4);
        assert.equal(statsd.host, '127.0.0.1');
        done();
      });
    };

    statsd = createStatsdClient({ host: 'localhost', cacheDns: true }, clientType);
  });

  it('should not attempt to cache a dns record if dnsCache is not specified', function (done) {
    var originalLookup = dns.lookup;
    var statsd;

    // Replace the dns lookup function with our mock dns lookup
    dns.lookup = function (host, callback) {
      assert.ok(false, 'StatsD constructor should not invoke dns.lookup when dnsCache is unspecified');
      dns.lookup = originalLookup;
    };

    statsd = createStatsdClient({ host: 'localhost' }, clientType);
    process.nextTick(function () {
      dns.lookup = originalLookup;
      done();
    });
  });

  it('should given an error in callbacks for a bad dns record if dnsCache is specified', function (done) {
    var originalLookup = dns.lookup;
    var statsd;

    // Replace the dns lookup function with our mock dns lookup
    dns.lookup = function(host, callback) {
      return callback(new Error('Bad host'));
    };

    statsd = createStatsdClient({ host: 'localhost', cacheDns: true }, clientType);

    statsd.increment('test', 1, 1, null, function (err) {
      assert.equal(err.message, 'Bad host');
      dns.lookup = originalLookup;
      done();
    });
  });

  it('should create a global variable set to StatsD() when specified', function () {
    var statsd = createStatsdClient(['host', 1234, 'prefix', 'suffix', true], clientType);
    assert.ok(global.statsd instanceof StatsD);
  });

  it('should not create a global variable when not specified', function () {
    var statsd = createStatsdClient(['host', 1234, 'prefix', 'suffix'], clientType);
    assert.equal(global.statsd, undefined);
  });

  it('should create a mock Client when mock variable is specified', function(){
    var statsd = createStatsdClient(['host', 1234, 'prefix', 'suffix', false, false, true], clientType);
    assert.ok(statsd.mock);
  });

  it('should create a socket variable that is an instance of dgram.Socket', function () {
    var statsd = createStatsdClient({}, clientType);
    assert.ok(statsd.socket instanceof dgram.Socket);
    skipClose = true;
  });

  it('should create a socket variable that is an instance of net.Socket if set to TCP', function (done) {
    server = createServer('tcp', function (address) {
      statsd = createStatsdClient({
        host: address.address,
        port: address.port,
        protocol: 'tcp'
      }, clientType);
      assert.ok(statsd.socket instanceof net.Socket);
      done();
    });
  });
});
