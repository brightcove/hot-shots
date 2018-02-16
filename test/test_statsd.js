"use strict";

var dgram = require('dgram'),
    domain = require('domain'),
    assert = require('assert'),
    mainStatsD = require('../').StatsD;

/**
 * Creates a test harness, that binds to an ephemeral port
 * @param test {Function} The test to run, should take message as the argument
 * @param callback {Function} The callback to call after the server is listening
 * @private
 */
function udpTest(test, callback){
  var server = dgram.createSocket("udp4");
  server.on('message', function(message){
    test(message.toString(), server);
  });

  server.on('listening', function(){
    callback(server);
  });

  server.bind(0, '127.0.0.1');
}

/**
 * Since sampling uses random, we need to patch Math.random() to always give
 * a consistent result
 */
Math.random = function(){
  return 0.42;
};

beforeEach(function () {
  //remove it from the namespace to not fail other tests
  delete global.statsd;
});

describe('StatsD (main client only)', function (StatsD) {
  describe('#init', function() {

    it('should set the proper values when specified', function(){
      // cachedDns isn't tested here; see below
      var statsd = new StatsD('host', 1234, 'prefix', 'suffix', true, null, true, ['gtag']);
      assert.equal(statsd.host, 'host');
      assert.equal(statsd.port, 1234);
      assert.equal(statsd.prefix, 'prefix');
      assert.equal(statsd.suffix, 'suffix');
      assert.equal(statsd, global.statsd);
      assert.equal(statsd.mock, true);
      assert.deepEqual(statsd.globalTags, ['gtag']);
    });

    it('should set the proper values with options hash format', function(){
      // cachedDns isn't tested here; see below
      var statsd = new StatsD({
        host: 'host',
        port: 1234,
        prefix: 'prefix',
        suffix: 'suffix',
        globalize: true,
        mock: true,
        globalTags: ['gtag'],
        sampleRate: 0.6
      });
      assert.equal(statsd.host, 'host');
      assert.equal(statsd.port, 1234);
      assert.equal(statsd.prefix, 'prefix');
      assert.equal(statsd.suffix, 'suffix');
      assert.equal(statsd, global.statsd);
      assert.equal(statsd.mock, true);
      assert.equal(statsd.sampleRate, 0.6);
      assert.deepEqual(statsd.globalTags, ['gtag']);
    });

    it('should map global_tags to globalTags for backwards compatibility', function(){
      var statsd = new StatsD({
        global_tags: ['gtag']
      });
      assert.deepEqual(statsd.globalTags, ['gtag']);
    });

    it('should attempt to cache a dns record if dnsCache is specified', function(done){
      var dns = require('dns'),
          originalLookup = dns.lookup,
          statsd;

      // replace the dns lookup function with our mock dns lookup
      dns.lookup = function(host, callback){
        process.nextTick(function(){
          dns.lookup = originalLookup;
          assert.equal(statsd.host, host);
          callback(null, '127.0.0.1', 4);
          assert.equal(statsd.host, '127.0.0.1');
          done();
        });
      };

      statsd = new StatsD({host: 'localhost', cacheDns: true});
    });

    it('should given an error in callbacks for a bad dns record if dnsCache is specified', function(done){
      var dns = require('dns'),
          originalLookup = dns.lookup,
          statsd;

      // replace the dns lookup function with our mock dns lookup
      dns.lookup = function(host, callback){
        return callback(new Error('that is a bad host'));
      };

      statsd = new StatsD({host: 'localhost', cacheDns: true});

      statsd.increment('test', 1, 1, null, function(err) {
        assert.equal(err.message, 'that is a bad host');
        dns.lookup = originalLookup;
        done();
      });
    });

    it('should create a global variable set to StatsD() when specified', function(){
      var statsd = new StatsD('host', 1234, 'prefix', 'suffix', true);
      assert.ok(global.statsd instanceof StatsD);
    });

  });

  describe('#buffer', function() {
    it('should aggregate packets when maxBufferSize is set to non-zero', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, 'a:1|c\nb:2|c\n');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var options = {
          host: address.host,
          port: address.port,
          maxBufferSize: 12
        };
        var statsd = new StatsD(options);
        statsd.increment('a', 1);
        statsd.increment('b', 2);
      });
    });
  });

}.bind(null, mainStatsD));

describe('StatsD (child client only)', function (StatsD) {
  describe('#init', function() {

    it('should set the proper values when specified', function(){
      var statsd = new StatsD('host', 1234, 'prefix', 'suffix', true, null, true, ['gtag', 'tag1:234234']);
      var child = statsd.childClient({
            prefix: 'preff.',
            suffix: '.suff',
            globalTags: ['awesomeness:over9000', 'tag1:xxx', 'bar', ':baz']
          });
      assert.equal(child.prefix, 'preff.prefix');
      assert.equal(child.suffix, 'suffix.suff');
      assert.equal(statsd, global.statsd);
      assert.deepEqual(child.globalTags, ['gtag', 'tag1:xxx', 'awesomeness:over9000', 'bar', ':baz']);
    });

  });

  describe('#buffer', function() {
    it('should aggregate packets when maxBufferSize is set to non-zero', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, 'a:1|c\nb:2|c\n');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var options = {
          host: address.host,
          port: address.port,
          maxBufferSize: 12
        };
        var statsd = new StatsD(options).childClient();
        statsd.increment('a', 1);
        statsd.increment('b', 2);
      });
    });
  });

  describe('#childClient', function() {

    it('should add tags, prefix and suffix without parent values', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, 'preff.a.suff:1|c|#awesomeness:over9000\npreff.b.suff:2|c|#awesomeness:over9000\n');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var options = {
          host: address.host,
          port: address.port,
          maxBufferSize: 500
        };
        var statsd = new StatsD(options).childClient({
          prefix: 'preff.',
          suffix: '.suff',
          globalTags: ['awesomeness:over9000']
        });
        statsd.increment('a', 1);
        statsd.increment('b', 2);
      });
    });

    it('should add tags, prefix and suffix with parent values', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, 'preff.p.a.s.suff:1|c|#xyz,awesomeness:' +
         'over9000\npreff.p.b.s.suff:2|c|#xyz,awesomeness:over9000\n');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var options = {
          host: address.host,
          port: address.port,
          prefix: 'p.',
          suffix: '.s',
          globalTags: ['xyz'],
          maxBufferSize: 500
        };
        var statsd = new StatsD(options).childClient({
          prefix: 'preff.',
          suffix: '.suff',
          globalTags: ['awesomeness:over9000']
        });
        statsd.increment('a', 1);
        statsd.increment('b', 2);
      });
    });

  });

}.bind(null, mainStatsD));

function doTests(StatsD) {
  /**
   * Given a StatsD method, make sure no data is sent to the server
   * for this method when used on a mock Client.
   */
  function assertMockClientMethod(method, finished){
    var testFinished = "test finished message";

    udpTest(function(message, server){
      // We only expect to get our own test finished message, no stats.
      assert.equal(message, testFinished);
      server.close();
      finished();
    }, function(server){
      var address = server.address(),
          statsd = new StatsD(address.address, address.port, 'prefix', 'suffix', false, false,
              /* mock = true */ true),
          socket = dgram.createSocket("udp4"),
          buf = new Buffer(testFinished),
          callbackThrows = false;

      // Regression test for "undefined is not a function" with missing callback on mock instance.
      try {
        statsd[method]('test', 1);
      } catch(e) {
        callbackThrows = true;
      }
      assert.ok(!callbackThrows);

      statsd[method]('test', 1, null, function(error, bytes){
        assert.ok(!error);
        assert.equal(bytes, 0);
        // We should call finished() here, but we have to work around
        // https://github.com/joyent/node/issues/2867 on node 0.6,
        // such that we don't close the socket within the `listening` event
        // and pass a single message through instead.
        socket.send(buf, 0, buf.length, address.port, address.address,
            function(){ socket.close(); });
      });
    });
  }

  describe('#init', function(){

    it('should set default values when not specified', function(){
      // cachedDns isn't tested here; see below
      var statsd = new StatsD();
      assert.equal(statsd.host, 'localhost');
      assert.equal(statsd.port, 8125);
      assert.equal(statsd.prefix, '');
      assert.equal(statsd.suffix, '');
      assert.equal(global.statsd, undefined);
      assert.equal(statsd.mock, undefined);
      assert.deepEqual(statsd.globalTags, []);
      assert.ok(!statsd.mock);
    });

    it('should not attempt to cache a dns record if dnsCache is not specified', function(done){
      var dns = require('dns'),
          originalLookup = dns.lookup,
          statsd;

      // replace the dns lookup function with our mock dns lookup
      dns.lookup = function(host, callback){
        assert.ok(false, 'StatsD constructor should not invoke dns.lookup when dnsCache is unspecified');
        dns.lookup = originalLookup;
      };

      statsd = new StatsD({host: 'localhost'});
      process.nextTick(function(){
        dns.lookup = originalLookup;
        done();
      });
    });

    it('should not create a global variable when not specified', function(){
      var statsd = new StatsD('host', 1234, 'prefix', 'suffix');
      assert.equal(global.statsd, undefined);
    });

    it('should create a mock Client when mock variable is specified', function(){
      var statsd = new StatsD('host', 1234, 'prefix', 'suffix', false, false, true);
      assert.ok(statsd.mock);
    });

    it('should create a socket variable that is an instance of dgram.Socket', function(){
      var statsd = new StatsD();
      assert.ok(statsd.socket instanceof dgram.Socket);
    });

  });

  describe('#globalTags', function(){
    it('should not add global tags if they are not specified', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:1|c');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.increment('test');
      });
    });

    it('should add global tags if they are specified', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:1|c|#gtag');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              globalTags: ['gtag']
            });

        statsd.increment('test');
      });
    });

    it('should combine global tags and metric tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:1337|c|#gtag,foo');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              globalTags: ['gtag']
            });

        statsd.increment('test', 1337, ['foo']);
      });
    });

    it('should override global tags with metric tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:1337|c|#foo,gtag:234,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              globalTags: ['foo', 'gtag:123']
            });

        statsd.increment('test', 1337, ['gtag:234', 'bar']);
      });
    });

    it('should format global tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:1337|c|#gtag:234,foo:bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              globalTags: { gtag: "123", foo: "bar"}
            });

        statsd.increment('test', 1337, { gtag: "234"});
      });
    });

    it('should replace reserved characters with underscores in tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:1337|c|#foo:b_a_r,reserved_character:is_replaced_');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              globalTags: { foo: "b,a,r"}
            });

        statsd.increment('test', 1337, { "reserved:character": "is@replaced@"});
      });
    });

    it('should add global tags using telegraf format when enabled', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test,gtag=gvalue,gtag2=gvalue2:1|c');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              globalTags: ['gtag:gvalue', 'gtag2:gvalue2'],
              telegraf: true
            });

        statsd.increment('test');
      });
    });

    it('should combine global tags and metric tags using telegraf format when enabled', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test,gtag=gvalue,foo=bar:1337|c');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              globalTags: ['gtag=gvalue'],
              telegraf: true
            });

        statsd.increment('test', 1337, ['foo:bar']);
      });
    });

    it('should format global key-value tags using telegraf format when enabled', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test,gtag=gvalue,foo=bar:1337|c');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              globalTags: { gtag: "gvalue"},
              telegraf: true
            });

        statsd.increment('test', 1337, { foo: "bar" });
      });
    });

  });

  describe('#timer', function() {
    it('should send stat and time to execute to timing function', function(finished) {
      udpTest(function (message, server) {
        // Search for a string similar to 'test:0.123|ms'
        var re = RegExp("(test:)([0-9]+\.[0-9]+)\\|{1}(ms)");
        assert.equal(true, re.test(message));
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
          statsd = new StatsD(address.address, address.port);

        var testFunc = function(a, b) {
          return a + b;
        };

        statsd.timer(testFunc, 'test')(2, 2);
      });
    });

    it('should send data with tags to timing function', function(finished) {
      udpTest(function (message, server) {
        // Search for a string similar to 'test:0.123|ms|#foo,bar'
        var re = RegExp("(test:)([0-9]+\.[0-9]+)\\|{1}(ms)\\|{1}\\#(foo,bar)");
        assert.equal(true, re.test(message));
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
          statsd = new StatsD(address.address, address.port);

        var testFunc = function (a, b) {
          return a + b;
        };

        statsd.timer(testFunc, 'test', undefined, ['foo', 'bar'])(2, 2);
      });
    });
  });

  describe('#timing', function(){
    it('should send proper time format without prefix, suffix, sampling and callback', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|ms');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.timing('test', 42);
      });
    });

    it('should send proper time format with tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|ms|#foo,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.timing('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper time format with prefix, suffix, sampling and callback', function(finished){
      var called = false;
      udpTest(function(message, server){
        assert.equal(message, 'foo.test.bar:42|ms|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port, 'foo.', '.bar');

        statsd.timing('test', 42, 0.5, function(){
          called = true;
        });
      });
    });

    it('should properly send a and b with the same value', function(finished){
      var called = false,
          messageNumber = 0;

      udpTest(function(message, server){
        if(messageNumber === 0){
          assert.equal(message, 'a:42|ms');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:42|ms');
          server.close();
          finished();
        }
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.timing(['a', 'b'], 42, null, function(error, bytes){
          called += 1;
          assert.ok(called === 1); //ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 14);
        });
      });
    });

    it('should send no timing stat when a mock Client is used', function(finished){
      assertMockClientMethod('timing', finished);
    });

    it('should format tags to datadog format by default', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|ms|#foo:bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.timing('test', 42, {foo: 'bar'});
      });
    });

    it('should format tags when using telegraf format', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test,foo=bar:42|ms');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD({
              address: address.address,
              port: address.port,
              telegraf: true
            });

        statsd.timing('test', 42, { foo: 'bar'});
      });
    });

  });

  describe('#histogram', function(){
    it('should send proper histogram format without prefix, suffix, sampling and callback', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|h');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.histogram('test', 42);
      });
    });

    it('should send proper histogram format with tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|h|#foo,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.histogram('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper histogram format with prefix, suffix, sampling and callback', function(finished){
      var called = false;
      udpTest(function(message, server){
        assert.equal(message, 'foo.test.bar:42|h|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port, 'foo.', '.bar');

        statsd.histogram('test', 42, 0.5, function(){
          called = true;
        });
      });
    });

    it('should properly send a and b with the same value', function(finished){
      var called = 0,
          messageNumber = 0;

      udpTest(function(message, server){
        if(messageNumber === 0){
          assert.equal(message, 'a:42|h');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:42|h');
          server.close();
          finished();
        }
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.histogram(['a', 'b'], 42, null, function(error, bytes){
          called += 1;
          assert.ok(called === 1); //ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 12);
        });
      });
    });

    it('should send no histogram stat when a mock Client is used', function(finished){
      assertMockClientMethod('histogram', finished);
    });

    it('should call callback after histogram call', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|h');
        server.close();
      }, function(server){
        var address = server.address(),
          statsd = new StatsD(address.address, address.port);

        statsd.histogram('test', 42, null, null, function(err, data) {
          assert.equal(data, 9);
          finished();
        });
      });
    });

    it('should have error in callback after bad histogram call', function(finished){
      udpTest(function(message, server){
        throw new Error('should not be called');
      }, function(server){
        var address = server.address(),
          statsd = new StatsD(address.address, address.port);

        statsd.close(function() {
          statsd.histogram('test', 42, null, null, function(err, data) {
            assert.ok(err !== undefined);
            assert.ok(data === undefined);
            finished();
          });
        });
      });
    });

  });

  describe('#gauge', function(){
    it('should send proper gauge format without prefix, suffix, sampling and callback', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|g');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.gauge('test', 42);
      });
    });

    it('should send proper gauge format with tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|g|#foo,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.gauge('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper gauge format with prefix, suffix, sampling and callback', function(finished){
      var called = false;
      udpTest(function(message, server){
        assert.equal(message, 'foo.test.bar:42|g|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port, 'foo.', '.bar');

        statsd.gauge('test', 42, 0.5, function(){
          called = true;
        });
      });
    });

    it('should properly send a and b with the same value', function(finished){
      var called = 0,
          messageNumber = 0;

      udpTest(function(message, server){
        if(messageNumber === 0){
          assert.equal(message, 'a:42|g');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:42|g');
          server.close();
          finished();
        }
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.gauge(['a', 'b'], 42, null, function(error, bytes){
          called += 1;
          assert.ok(called === 1); //ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 12);
        });
      });
    });

    it('should send no gauge stat when a mock Client is used', function(finished){
      assertMockClientMethod('gauge', finished);
    });
  });

  describe('#increment', function(){
    it('should send count by 1 when no params are specified', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:1|c');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.increment('test');
      });
    });

    it('should use when increment is 0', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:0|c');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.increment('test', 0);
      });
    });

    it('should send proper count format with tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|c|#foo,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.increment('test', 42, ['foo', 'bar']);
      });
    });

    it('should send default count 1 with tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:1|c|#foo,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.increment('test', ['foo', 'bar']);
      });
    });

    it('should send tags when sampleRate is omitted', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:23|c|#foo,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.increment('test', 23, ['foo', 'bar']);
      });
    });

    it('should send proper count format with prefix, suffix, sampling and callback', function(finished){
      var called = false;
      udpTest(function(message, server){
        assert.equal(message, 'foo.test.bar:42|c|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port, 'foo.', '.bar');

        statsd.increment('test', 42, 0.5, function(){
          called = true;
        });
      });
    });

    it('should properly send a and b with the same value', function(finished){
      var called = 0,
          messageNumber = 0;

      udpTest(function(message, server){
        if(messageNumber === 0){
          assert.equal(message, 'a:1|c');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:1|c');
          server.close();
          finished();
        }
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.increment(['a', 'b'], null, function(error, bytes){
          called += 1;
          assert.ok(called === 1); //ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 10);
        });
      });
    });

    it('should send no increment stat when a mock Client is used', function(finished){
      assertMockClientMethod('increment', finished);
    });
  });

  describe('#decrement', function(){
    it('should send count by -1 when no params are specified', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:-1|c');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.decrement('test');
      });
    });

    it('should send proper count format with tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:-42|c|#foo,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.decrement('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper count format with prefix, suffix, sampling and callback', function(finished){
      var called = false;
      udpTest(function(message, server){
        assert.equal(message, 'foo.test.bar:-42|c|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port, 'foo.', '.bar');

        statsd.decrement('test', 42, 0.5, function(){
          called = true;
        });
      });
    });


    it('should properly send a and b with the same value', function(finished){
      var called = 0,
          messageNumber = 0;

      udpTest(function(message, server){
        if(messageNumber === 0){
          assert.equal(message, 'a:-1|c');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:-1|c');
          server.close();
          finished();
        }
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.decrement(['a', 'b'], null, function(error, bytes){
          called += 1;
          assert.ok(called === 1); //ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 12);
        });
      });
    });

    it('should send no decrement stat when a mock Client is used', function(finished){
      assertMockClientMethod('decrement', finished);
    });
  });

  describe('#set', function(){
    it('should send proper set format without prefix, suffix, sampling and callback', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|s');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.set('test', 42);
      });
    });

    it('should send proper set format with tags', function(finished){
      udpTest(function(message, server){
        assert.equal(message, 'test:42|s|#foo,bar');
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.set('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper set format with prefix, suffix, sampling and callback', function(finished){
      var called = false;
      udpTest(function(message, server){
        assert.equal(message, 'foo.test.bar:42|s|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port, 'foo.', '.bar');

        statsd.unique('test', 42, 0.5, function(){
          called = true;
        });
      });
    });

    it('should properly send a and b with the same value', function(finished){
      var called = 0,
          messageNumber = 0;

      udpTest(function(message, server){
        if(messageNumber === 0){
          assert.equal(message, 'a:42|s');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:42|s');
          server.close();
          finished();
        }
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.unique(['a', 'b'], 42, null, function(error, bytes){
          called += 1;
          assert.ok(called === 1); //ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 12);
        });
      });
    });

    it('should send no set stat when a mock Client is used', function(finished){
      assertMockClientMethod('set', finished);
    });
  });
  describe('#event', function() {
    it('should send proper event format for title and text', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, '_e{4,11}:test|description');
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.event('test', 'description');
      });
    });

    it('should reuse the title when when text is missing', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, '_e{4,4}:test|test');
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.event('test');
      });
    });

    it('should send proper event format for title, text, and options', function (finished) {
      var date = new Date();
      udpTest(function (message, server) {
        assert.equal(message, '_e{10,31}:test title|another\\nmultiline\\ndescription|d:' +
          Math.round(date.getTime() / 1000) + '|h:host|k:ag_key|p:low|s:source_type|t:warning');
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port),
            options = {
              date_happened: date,
              hostname: 'host',
              aggregation_key: 'ag_key',
              priority: 'low',
              source_type_name: 'source_type',
              alert_type: 'warning'
            };

        statsd.event('test title', 'another\nmultiline\ndescription', options);
      });
    });

    it('should send proper event format for title, text, some options, and tags', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, '_e{10,12}:test title|another desc|h:host|#foo,bar');
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port),
            options = {
              hostname: 'host'
            };

        statsd.event('test title', 'another desc', options, ['foo', 'bar']);
      });
    });

    it('should send proper event format for title, text, tags, and a callback', function (finished) {
      var called = true;
      udpTest(function (message, server) {
        assert.equal(message, '_e{10,12}:test title|another desc|#foo,bar');
        assert.equal(called, true);
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.event('test title', 'another desc', null, ['foo', 'bar'], function(){
          called = true;
        });
      });
    });

    it('should send no event stat when a mock Client is used', function(finished){
      assertMockClientMethod('event', finished);
    });

    it('should throw and execption when using telegraf format', function(finished){
      udpTest(function () {
        // will not fire
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              telegraf: true
            });

        assert.throws(function () {
          statsd.event('test title', 'another desc', null, ['foo', 'bar']);
        }, function (err) {
          server.close();
          finished();
        });
      });
    });

    it('should use errorHandler', function (finished) {
      var statsd = new StatsD({
        telegraf: true,
        errorHandler: function () {
          finished();
        }
      });
      statsd.event('test title', 'another desc');
    });

  });

  describe('#check', function() {
    it('should send proper check format for name and status', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, '_sc|check.name|0');
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.check('check.name', statsd.CHECKS.OK);
      });
    });

    it('should send proper check format for name and status with global prefix and suffix', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, '_sc|prefix.check.name.suffix|0');
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              prefix: 'prefix.',
              suffix: '.suffix'
            });

        statsd.check('check.name', statsd.CHECKS.OK);
      });
    });

    it('should send proper check format for name, status, and options', function (finished) {
      var date = new Date();
      udpTest(function (message, server) {
        assert.equal(message, '_sc|check.name|1|d:' +
          Math.round(date.getTime() / 1000) + '|h:host|m:message');
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port),
            options = {
              date_happened: date,
              hostname: 'host',
              message: 'message'
            };

        statsd.check('check.name', statsd.CHECKS.WARNING, options);
      });
    });

    it('should send proper check format for name, status, some options, and tags', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, '_sc|check.name|2|h:host|#foo,bar|m:message');
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port),
            options = {
              hostname: 'host',
              message: 'message'
            };

        statsd.check('check.name', statsd.CHECKS.CRITICAL, options, ['foo', 'bar']);
      });
    });

    it('should send proper event format for name, status, tags, and a callback', function (finished) {
      var called = true;
      udpTest(function (message, server) {
        assert.equal(message, '_sc|check.name|0|#foo,bar');
        assert.equal(called, true);
        server.close();
        finished();
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.check('check.name', statsd.CHECKS.OK, null, ['foo', 'bar'], function(){
          called = true;
        });
      });
    });

    it('should send no event stat when a mock Client is used', function(finished){
      assertMockClientMethod('check', finished);
    });

    it('should throw and execption when using telegraf format', function(finished){
      udpTest(function () {
        // will not fire
      }, function (server) {
        var address = server.address(),
            statsd = new StatsD({
              host: address.address,
              port: address.port,
              telegraf: true
            });

        assert.throws(function () {
          statsd.check('check.name', statsd.CHECKS.OK, null, ['foo', 'bar']);
        }, function (err) {
          server.close();
          finished();
        });
      });
    });

    it('should use errorHandler', function (finished) {
      var statsd = new StatsD({
        telegraf: true,
        errorHandler: function () {
          finished();
        }
      });
      statsd.check('check.name', statsd.CHECKS.OK);
    });

  });

  describe('#buffer', function() {
    it('should aggregate packets when maxBufferSize is set to non-zero', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, 'a:1|c\nb:2|c\n');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var options = {
          host: address.host,
          port: address.port,
          maxBufferSize: 12
        };
        var statsd = new StatsD(options);
        statsd.increment('a', 1);
        statsd.increment('b', 2);
      });
    });

    it('should not send batches larger then maxBufferSize', function (finished) {
      udpTest(function (message, server) {
        assert.equal(message, 'a:1|c\n');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var options = {
          host: address.host,
          port: address.port,
          maxBufferSize: 8
        };
        var statsd = new StatsD(options);
        statsd.increment('a', 1);
        statsd.increment('b', 2);
      });
    });

    it('should not aggregate packets when maxBufferSize is set to zero', function (finished) {
      var results = [
        'a:1|c',
        'b:2|c'
      ];
      var msgCount = 0;
      udpTest(function (message, server) {
        var index = results.indexOf(message);
        assert.equal(index >= 0, true);
        results.splice(index, 1);
        msgCount++;
        if (msgCount >= 2) {
          assert.equal(results.length, 0);
          server.close();
          finished();
        }
      }, function (server) {
        var address = server.address();
        var options = {
          host: address.host,
          port: address.port,
          maxBufferSize: 0
        };
        var statsd = new StatsD(options);

        statsd.increment('a', 1);
        statsd.increment('b', 2);
      });
    });

    it('should flush the buffer when timeout value elapsed', function (finished) {
      var timestamp;
      udpTest(function (message, server) {
        assert.equal(message, 'a:1|c\n');
        var elapsed = Date.now() - timestamp;
        assert.equal(elapsed > 1000, true);
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var options = {
          host: address.host,
          port: address.port,
          maxBufferSize: 1220,
          bufferFlushInterval: 1100
        };
        var statsd = new StatsD(options);

        timestamp = new Date();
        statsd.increment('a', 1);
      });
    });
  });

  describe('#close', function(){

    it('should call callback after close call', function(finished){
      udpTest(function(message, server){
        throw new Error('should not be called');
      }, function(server){
        var address = server.address(),
            statsd = new StatsD(address.address, address.port);

        statsd.close(function() {
          finished();
        });
      });
    });

    it('should use errorHandler', function (finished) {
      var statsd = new StatsD({
        errorHandler: function (e) {
          finished();
        }
      });
      statsd.socket.close = function () {
        throw new Error('boom!');
      };
      statsd.close();
    });

  });

  describe('#send', function() {

    it('should use errorHandler', function (finished) {
      var err = new Error('boom!');
      var statsd = new StatsD({
        errorHandler: function (e) {
          assert.equal(e, err);
          finished();
        }
      });
      statsd.dnsError = err;
      statsd.send('test title');
    });

  });

  describe('#sendMessage', function() {

    it('should use errorHandler', function (finished) {
      var err = new Error('boom!');
      var statsd = new StatsD({
        errorHandler: function (e) {
          assert.equal(e, err);
          finished();
        }
      });
      statsd.dnsError = err;
      statsd.send('test title');
    });

    it('should errback for an unresolvable host', function (finished) {
      var statsd = new StatsD({
        host: 'unresolvable'
      });

      statsd.send('test title', [], function (error) {
        assert.ok(error);
        assert.equal(error.code, 'ENOTFOUND');
        finished();
      });
    });

    it('should use errorHandler for an unresolvable host', function (finished) {
      var statsd = new StatsD({
        host: 'unresolvable',
        errorHandler: function (error) {
          assert.ok(error);
          assert.equal(error.code, 'ENOTFOUND');
          finished();
        }
      });

      statsd.send('test title');
    });

    it('should throw for an unresolvable host', function (finished) {
      var d = domain.create();
      var statsd = new StatsD({
        host: 'unresolvable',
      });

      d.add(statsd.socket);

      d.on('error', function (error) {
        assert.ok(error);
        assert.equal(error.code, 'ENOTFOUND');

        // Important to exit the domain or further tests will continue to run
        // therein.
        d.exit();

        finished();
      });

      d.run(function () {
        statsd.send('test title');
      });
    });

  });

  describe('#sendAll', function() {

    it('should use errorHandler', function (finished) {
      var err = new Error('boom!');
      var statsd = new StatsD({
        errorHandler: function (e) {
          assert.equal(e, err);
          finished();
        }
      });
      statsd.sendStat = function (item, value, type, sampleRate, tags, callback) {
        callback(err);
      };
      statsd.sendAll(['test title'], 'another desc');
    });

  });
}

describe('StatsD main client', doTests.bind(null, mainStatsD));
describe('StatsD child client', doTests.bind(null, function () {
  // https://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
  var statsd = new (
      Function.prototype.bind.apply(mainStatsD, [null].concat(Array.prototype.slice.call(arguments, 0)))
  )();
  return statsd.childClient({
    // empty options to verify same behaviour
  });
}));
describe('StatsD child of a child client', doTests.bind(null, function () {
  var statsd = new (
      Function.prototype.bind.apply(mainStatsD, [null].concat(Array.prototype.slice.call(arguments, 0)))
  )();
  return statsd.childClient({
    // empty options to verify same behaviour
  }).childClient({
    // empty options to verify same behaviour
  });
}));
