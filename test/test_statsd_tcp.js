"use strict";

var assert = require('assert');
var net = require('net');
var StatsD = require('../').StatsD;

/**
 * Creates a test harness for TCP, that binds to an ephemeral port
 * @param test {Function} The test to run, should take message as the argument
 * @param callback {Function} The callback to call after the server is listening
 * @private
 */
function tcpTest(test, callback) {

  // This is the actual TCP server implementation of etsy/statsd
  // Including the metrics handler which splits the TCP packet on "\n"
  // to deal with multiple metrics in a single TCP stream data flush
  var server = net.createServer(function (stream) {
    stream.setEncoding('ascii');

    var buffer = '';
    stream.on('data', function (data) {
      buffer += data;
      var offset = buffer.lastIndexOf("\n");
      if (offset > -1) {
        var packet = buffer.slice(0, offset + 1);
        buffer = buffer.slice(offset + 1);

        var metrics;
        if (packet.indexOf("\n") > -1) {
          metrics = packet.split("\n");
        } else {
          metrics = [packet];
        }

        metrics.forEach(function (metric) {
          test(metric, server);
        });
      }
    });
  });

  server.on('listening', function () {
    callback(server);
  });

  server.listen(0, '127.0.0.1');
}

describe('StatsD [TCP]', function (StatsDClient) {
  describe('#init', function () {
    it('should set the proper values with options hash format', function(){
      // cachedDns isn't tested here; see below
      var statsd = new StatsDClient({
        host: 'host',
        port: 1234,
        prefix: 'prefix',
        suffix: 'suffix',
        globalize: true,
        mock: true,
        globalTags: ['gtag'],
        sampleRate: 0.6,
        protocol: 'tcp'
      });
      assert.equal(statsd.host, 'host');
      assert.equal(statsd.port, 1234);
      assert.equal(statsd.prefix, 'prefix');
      assert.equal(statsd.suffix, 'suffix');
      assert.equal(statsd, global.statsd);
      assert.equal(statsd.mock, true);
      assert.equal(statsd.sampleRate, 0.6);
      assert.deepEqual(statsd.globalTags, ['gtag']);
      assert.equal(statsd.protocol, 'tcp');
    });

    it('should create a socket variable that is an instance of net.Socket if set to TCP', function () {
      var statsd = new StatsD({ protocol: 'tcp' });
      assert.ok(statsd.socket instanceof net.Socket);
    });
  });

  describe('#globalTags', function () {
    it('should not add global tags if they are not specified', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:1|c');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.increment('test');
      });
    });

    it('should add global tags if they are specified', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:1|c|#gtag');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address,
          port: address.port,
          global_tags: ['gtag'],
          protocol: 'tcp'
        });

        statsd.increment('test');
      });
    });

    xit('should combine global tags and metric tags', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:1337|c|#foo,gtag');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address,
          port: address.port,
          global_tags: ['gtag'],
          protocol: 'tcp'
        });

        statsd.increment('test', 1337, ['foo']);
      });
    });
  });

  describe('#timing', function () {
    it('should send proper time format without prefix, suffix, sampling and callback', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|ms');
        server.close();
        finished();
      }, function(server){
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.timing('test', 42);
      });
    });

    it('should send proper time format with tags', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|ms|#foo,bar');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.timing('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper time format with prefix, suffix, sampling and callback', function (finished) {
      var called = false;
      tcpTest(function (message, server) {
        assert.equal(message, 'foo.test.bar:42|ms|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port, 
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });

        statsd.timing('test', 42, 0.5, function () {
          called = true;
        });
      });
    });

    xit('should properly send a and b with the same value', function (finished) {
      var called = false;
      var messageNumber = 0;

      tcpTest(function (message, server) {
        if (messageNumber === 0) {
          assert.equal(message, 'a:42|ms');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:42|ms');
          server.close();
          finished();
        }
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address,
          port: address.port,
          protocol: 'tcp'
        });

        statsd.timing(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
    });
  });

  describe('#histogram', function () {
    it('should send proper histogram format without prefix, suffix, sampling and callback', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|h');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.histogram('test', 42);
      });
    });

    it('should send proper histogram format with tags', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|h|#foo,bar');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.histogram('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper histogram format with prefix, suffix, sampling and callback', function (finished) {
      var called = false;
      tcpTest(function (message, server) {
        assert.equal(message, 'foo.test.bar:42|h|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port, 
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });

        statsd.histogram('test', 42, 0.5, function () {
          called = true;
        });
      });
    });

    xit('should properly send a and b with the same value', function (finished) {
      var called = 0;
      var messageNumber = 0;

      tcpTest(function (message, server) {
        if (messageNumber === 0) {
          assert.equal(message, 'a:42|h');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:42|h');
          server.close();
          finished();
        }
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address,
          port: address.port,
          protocol: 'tcp'
        });

        statsd.histogram(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
    });
  });

  describe('#gauge', function () {
    it('should send proper gauge format without prefix, suffix, sampling and callback', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|g');
        server.close();
        finished();
      }, function(server){
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.gauge('test', 42);
      });
    });

    it('should send proper gauge format with tags', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|g|#foo,bar');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.gauge('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper gauge format with prefix, suffix, sampling and callback', function (finished) {
      var called = false;
      tcpTest(function (message, server) {
        assert.equal(message, 'foo.test.bar:42|g|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port, 
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });

        statsd.gauge('test', 42, 0.5, function(){
          called = true;
        });
      });
    });

    xit('should properly send a and b with the same value', function (finished) {
      var called = 0;
      var messageNumber = 0;

      tcpTest(function (message, server) {
        if(messageNumber === 0){
          assert.equal(message, 'a:42|g');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:42|g');
          server.close();
          finished();
        }
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.gauge(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
    });
  });

  describe('#increment', function () {
    it('should send count by 1 when no params are specified', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:1|c');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.increment('test');
      });
    });

    it('should send proper count format with tags', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|c|#foo,bar');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.increment('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper count format with prefix, suffix, sampling and callback', function (finished) {
      var called = false;
      tcpTest(function (message, server) {
        assert.equal(message, 'foo.test.bar:42|c|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port, 
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });

        statsd.increment('test', 42, 0.5, function () {
          called = true;
        });
      });
    });

    xit('should properly send a and b with the same value', function (finished) {
      var called = 0;
      var messageNumber = 0;

      tcpTest(function (message, server) {
        if (messageNumber === 0) {
          assert.equal(message, 'a:1|c');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:1|c');
          server.close();
          finished();
        }
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.increment(['a', 'b'], null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
    });
  });

  describe('#decrement', function () {
    it('should send count by -1 when no params are specified', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:-1|c');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.decrement('test');
      });
    });

    it('should send proper count format with tags', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:-42|c|#foo,bar');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.decrement('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper count format with prefix, suffix, sampling and callback', function (finished) {
      var called = false;
      tcpTest(function (message, server) {
        assert.equal(message, 'foo.test.bar:-42|c|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function(server){
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port, 
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });

        statsd.decrement('test', 42, 0.5, function () {
          called = true;
        });
      });
    });

    xit('should properly send a and b with the same value', function (finished) {
      var called = 0;
      var messageNumber = 0;

      tcpTest(function (message, server) {
        if (messageNumber === 0) {
          assert.equal(message, 'a:-1|c');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:-1|c');
          server.close();
          finished();
        }
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.decrement(['a', 'b'], null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
    });
  });

  describe('#set', function () {
    it('should send proper set format without prefix, suffix, sampling and callback', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|s');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.set('test', 42);
      });
    });

    it('should send proper set format with tags', function (finished) {
      tcpTest(function (message, server) {
        assert.equal(message, 'test:42|s|#foo,bar');
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address,
          port: address.port,
          protocol: 'tcp'
        });

        statsd.set('test', 42, ['foo', 'bar']);
      });
    });

    it('should send proper set format with prefix, suffix, sampling and callback', function (finished) {
      var called = false;
      tcpTest(function (message, server) {
        assert.equal(message, 'foo.test.bar:42|s|@0.5');
        assert.equal(called, true);
        server.close();
        finished();
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port, 
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });

        statsd.unique('test', 42, 0.5, function () {
          called = true;
        });
      });
    });

    xit('should properly send a and b with the same value', function (finished) {
      var called = 0;
      var messageNumber = 0;

      tcpTest(function (message, server) {
        if (messageNumber === 0) {
          assert.equal(message, 'a:42|s');
          messageNumber += 1;
        } else {
          assert.equal(message, 'b:42|s');
          server.close();
          finished();
        }
      }, function (server) {
        var address = server.address();
        var statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });

        statsd.unique(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
    });
  });
}.bind(null, StatsD));
