'use strict';

var assert = require('assert');
var dgram = require('dgram');
var net = require('net');

var createStatsdClient = require('./helpers').createStatsdClient;
var createTCPServer = require('./helpers').createTCPServer;
var createUDPServer = require('./helpers').createUDPServer;

module.exports = function runHistogramTestSuite() {
  describe('#statsFunctions', function () {
    var server;
    var statsd;

    afterEach(function () {
      server = null;
      statsd = null;
    });

    ['main client', 'child client', 'child of child client'].forEach(function (description, index) {
      describe(description, function () {
        [ { name: 'timing', unit: 'ms', bytes: 14 },
          { name: 'histogram', unit: 'h', bytes: 12 },
          { name: 'distribution', unit: 'd', bytes: 12 },
          { name: 'gauge', unit: 'g', bytes: 12 },
          { name: 'set', unit: 's', bytes: 12 },
        ].forEach(function (statFunction) {
          describe('#' + statFunction.name, function () {
            describe('UDP', function () {
              it('should send proper ' + statFunction.name +
                ' format without prefix, suffix, sampling and callback', function (done) {
                server = createUDPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                  }, index);
                  statsd[statFunction.name]('test', 42);
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'test:42|' + statFunction.unit);
                  server.close();
                  done();
                });
              });
    
              it('should send proper ' + statFunction.name + ' format with tags', function (done) {
                server = createUDPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                  }, index);
                  statsd[statFunction.name]('test', 42, ['foo', 'bar']);
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'test:42|' + statFunction.unit + '|#foo,bar');
                  server.close();
                  done();
                });
              });
    
              it('should send proper ' + statFunction.name +
                ' format with prefix, suffix, sampling and callback', function (done) {
                var called = false;
                server = createUDPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                    prefix: 'foo.',
                    suffix: '.bar'
                  }, index);
                  statsd[statFunction.name]('test', 42, 0.5, function () {
                    called = true;
                  });
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'foo.test.bar:42|' + statFunction.unit + '|@0.5');
                  assert.equal(called, true);
                  server.close();
                  done();
                });
              });
    
              it('should properly send a and b with the same value', function (done) {
                var called = 0;
                var noOfMessages = 0;
                server = createUDPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port
                  });
                  statsd[statFunction.name](['a', 'b'], 42, null, function (error, bytes) {
                    called += 1;
                    assert.ok(called === 1); // Ensure it only gets called once
                    assert.equal(error, null);
                    assert.equal(bytes, statFunction.bytes);
                  });
                });
                server.on('metrics', function (metric) {
                  if (noOfMessages === 0) {
                    assert.equal(metric, 'a:42|' + statFunction.unit);
                    noOfMessages += 1;
                  } else {
                    assert.equal(metric, 'b:42|' + statFunction.unit);
                    server.close();
                    done();
                  }
                });
              });
    
              it('should send no ' + statFunction.name + ' stat when a mock Client is used', function (done) {
                var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
                server = createUDPServer(function (address) {
                  statsd = createStatsdClient([
                    address.address, address.port, 'prefix', 'suffix', false, false, true
                  ], index);
    
                  // Regression test for "undefined is not a function" with missing
                  // callback on mock instance
                  statsd[statFunction.name]('test', 1);
    
                  statsd[statFunction.name]('test', 1, null, function (error, bytes) {
                    var socket = dgram.createSocket("udp4");
                    var buf = new Buffer(TEST_FINISHED_MESSAGE);
    
                    assert.ok(!error);
                    assert.equal(bytes, 0);
                    // We should call finished() here, but we have to work around
                    // https://github.com/joyent/node/issues/2867 on node 0.6,
                    // such that we don't close the socket within the `listening` event
                    // and pass a single message through instead.
                    socket.send(buf, 0, buf.length, address.port, address.address, function () {
                      socket.close();
                    });
                  });
                });
                server.on('metrics', function (message) {
                  // We only expect to get our own test finished message, no stats
                  assert.equal(message, TEST_FINISHED_MESSAGE);
                  server.close();
                  done();
                });
              });
    
              it('should format tags to datadog format by default', function (done) {
                server = createUDPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port
                  });
                  statsd[statFunction.name]('test', 42, {foo: 'bar'});
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'test:42|' + statFunction.unit + '|#foo:bar');
                  server.close();
                  done();
                });
              });
    
              it('should format tags when using telegraf format', function (done) {
                server = createUDPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                    telegraf: true
                  });
                  statsd[statFunction.name]('test', 42, { foo: 'bar'});
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'test,foo=bar:42|' + statFunction.unit);
                  server.close();
                  done();
                });
              });
            });

            describe('TCP', function () {
              it('should send proper ' + statFunction.name +
                ' format without prefix, suffix, sampling and callback', function (done) {
                server = createTCPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                    protocol: 'tcp'
                  }, index);
                  statsd[statFunction.name]('test', 42);
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'test:42|' + statFunction.unit + '\n');
                  server.close();
                  done();
                });
              });
    
              it('should send proper ' + statFunction.name + ' format with tags', function (done) {
                server = createTCPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                    protocol: 'tcp'
                  }, index);
                  statsd[statFunction.name]('test', 42, ['foo', 'bar']);
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'test:42|' + statFunction.unit + '|#foo,bar\n');
                  server.close();
                  done();
                });
              });
    
              it('should send proper ' + statFunction.name +
                ' format with prefix, suffix, sampling and callback', function (done) {
                var called = false;
                server = createTCPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                    prefix: 'foo.',
                    suffix: '.bar',
                    protocol: 'tcp'
                  }, index);
                  statsd[statFunction.name]('test', 42, 0.5, function () {
                    called = true;
                  });
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'foo.test.bar:42|' + statFunction.unit + '|@0.5\n');
                  assert.equal(called, true);
                  server.close();
                  done();
                });
              });
    
              it('should properly send a and b with the same value', function (done) {
                var called = 0;
                server = createTCPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                    protocol: 'tcp'
                  });
                  statsd[statFunction.name](['a', 'b'], 42, null, function (error, bytes) {
                    called += 1;
                    assert.ok(called === 1); // Ensure it only gets called once
                    assert.equal(error, null);
                    assert.equal(bytes, 0);
                  });
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'a:42|' + statFunction.unit + '\nb:42|' + statFunction.unit + '\n');
                  server.close();
                  done();
                });
              });
    
              it('should send no ' + statFunction.unit + ' stat when a mock Client is used', function (done) {
                var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
                server = createTCPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address,
                    port: address.port,
                    prefix: 'prefix',
                    suffix: 'suffix',
                    mock: true,
                    protocol: 'tcp'
                  }, index);
    
                  // Regression test for "undefined is not a function" with missing
                  // callback on mock instance
                  statsd[statFunction.name]('test', 1);
    
                  statsd[statFunction.name]('test', 1, null, function (error, bytes) {
                    var socket = net.connect(address.port, address.address);
                    var buf = new Buffer(TEST_FINISHED_MESSAGE);
    
                    assert.ok(!error);
                    assert.equal(bytes, 0);
                    // We should call finished() here, but we have to work around
                    // https://github.com/joyent/node/issues/2867 on node 0.6,
                    // such that we don't close the socket within the `listening` event
                    // and pass a single message through instead.
                    socket.write(buf, 0, 'ascii', function () {
                      socket.close();
                    });
                  });
                });
                server.on('metrics', function (message) {
                  // We only expect to get our own test finished message, no stats
                  assert.equal(message, TEST_FINISHED_MESSAGE);
                  server.close();
                  done();
                });
              });
    
              it('should format tags to datadog format by default', function (done) {
                server = createTCPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                    protocol: 'tcp'
                  });
                  statsd[statFunction.name]('test', 42, { foo: 'bar' });
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'test:42|' + statFunction.unit + '|#foo:bar\n');
                  server.close();
                  done();
                });
              });
    
              it('should format tags when using telegraf format', function (done) {
                server = createTCPServer(function (address) {
                  statsd = createStatsdClient({
                    host: address.address, 
                    port: address.port,
                    telegraf: true,
                    protocol: 'tcp'
                  });
                  statsd[statFunction.name]('test', 42, { foo: 'bar' });
                });
                server.on('metrics', function (metrics) {
                  assert.equal(metrics, 'test,foo=bar:42|' + statFunction.unit + '\n');
                  server.close();
                  done();
                });
              });
            });
          });
        });

        describe('#increment', function () {
          describe('UDP', function () {
            it('should send count by 1 when no params are specified', function (done) {
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                }, index);
                statsd.increment('test');
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:1|c');
                server.close();
                done();
              });
            });

            it('should use when increment is 0', function (done) {
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                }, index);
                statsd.increment('test', 0);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:0|c');
                server.close();
                done();
              });
            });

            it('should send proper count format with tags', function (done) {
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                }, index);
                statsd.increment('test', 42, ['foo', 'bar']);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:42|c|#foo,bar');
                server.close();
                done();
              });
            });

            it('should send default count 1 with tags', function (done) {
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                }, index);
                statsd.increment('test', ['foo', 'bar']);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:1|c|#foo,bar');
                server.close();
                done();
              });
            });

            it('should send tags when sampleRate is omitted', function (done) {
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                }, index);
                statsd.increment('test', 23, ['foo', 'bar']);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:23|c|#foo,bar');
                server.close();
                done();
              });
            });

            it('should send proper count format with prefix, suffix, sampling and callback', function (done) {
              var called = false;
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  prefix: 'foo.',
                  suffix: '.bar'
                }, index);
                statsd.increment('test', 42, 0.5, function () {
                  called = true;
                });
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'foo.test.bar:42|c|@0.5');
                assert.equal(called, true);
                server.close();
                done();
              });
            });

            it('should properly send a and b with the same value', function (done) {
              var called = 0;
              var noOfMessages = 0;
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port
                });
                statsd.increment(['a', 'b'], null, function (error, bytes) {
                  called += 1;
                  assert.ok(called === 1); // Ensure it only gets called once
                  assert.equal(error, null);
                  assert.equal(bytes, 10);
                });
              });
              server.on('metrics', function (metric) {
                if (noOfMessages === 0) {
                  assert.equal(metric, 'a:1|c');
                  noOfMessages += 1;
                } else {
                  assert.equal(metric, 'b:1|c');
                  server.close();
                  done();
                }
              });
            });

            it('should send no increment stat when a mock Client is used', function (done) {
              var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
              server = createUDPServer(function (address) {
                statsd = createStatsdClient([
                  address.address, address.port, 'prefix', 'suffix', false, false, true
                ], index);
  
                // Regression test for "undefined is not a function" with missing
                // callback on mock instance
                statsd.increment('test', 1);
  
                statsd.increment('test', 1, null, function (error, bytes) {
                  var socket = dgram.createSocket("udp4");
                  var buf = new Buffer(TEST_FINISHED_MESSAGE);
  
                  assert.ok(!error);
                  assert.equal(bytes, 0);
                  // We should call finished() here, but we have to work around
                  // https://github.com/joyent/node/issues/2867 on node 0.6,
                  // such that we don't close the socket within the `listening` event
                  // and pass a single message through instead.
                  socket.send(buf, 0, buf.length, address.port, address.address, function () {
                    socket.close();
                  });
                });
              });
              server.on('metrics', function (message) {
                // We only expect to get our own test finished message, no stats
                assert.equal(message, TEST_FINISHED_MESSAGE);
                server.close();
                done();
              });
            });
          });

          describe('TCP', function () {
            it('should send count by 1 when no params are specified', function (done) {
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                }, index);
                statsd.increment('test');
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:1|c\n');
                server.close();
                done();
              });
            });

            it('should use when increment is 0', function (done) {
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                }, index);
                statsd.increment('test', 0);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:0|c\n');
                server.close();
                done();
              });
            });

            it('should send proper count format with tags', function (done) {
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                }, index);
                statsd.increment('test', 42, ['foo', 'bar']);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:42|c|#foo,bar\n');
                server.close();
                done();
              });
            });

            it('should send default count 1 with tags', function (done) {
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                }, index);
                statsd.increment('test', ['foo', 'bar']);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:1|c|#foo,bar\n');
                server.close();
                done();
              });
            });

            it('should send tags when sampleRate is omitted', function (done) {
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                }, index);
                statsd.increment('test', 23, ['foo', 'bar']);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:23|c|#foo,bar\n');
                server.close();
                done();
              });
            });

            it('should send proper count format with prefix, suffix, sampling and callback', function (done) {
              var called = false;
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  prefix: 'foo.',
                  suffix: '.bar',
                  protocol: 'tcp'
                }, index);
                statsd.increment('test', 42, 0.5, function () {
                  called = true;
                });
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'foo.test.bar:42|c|@0.5\n');
                assert.equal(called, true);
                server.close();
                done();
              });
            });

            it('should properly send a and b with the same value', function (done) {
              var called = 0;
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                });
                statsd.increment(['a', 'b'], 42, null, function (error, bytes) {
                  called += 1;
                  assert.ok(called === 1); // Ensure it only gets called once
                  assert.equal(error, null);
                  assert.equal(bytes, 0);
                });
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'a:42|c\nb:42|c\n');
                server.close();
                done();
              });
            });

            it('should send no increment stat when a mock Client is used', function (done) {
              var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address,
                  port: address.port,
                  prefix: 'prefix',
                  suffix: 'suffix',
                  mock: true,
                  protocol: 'tcp'
                }, index);
  
                // Regression test for "undefined is not a function" with missing
                // callback on mock instance
                statsd.increment('test', 1);
  
                statsd.increment('test', 1, null, function (error, bytes) {
                  var socket = net.connect(address.port, address.address);
                  var buf = new Buffer(TEST_FINISHED_MESSAGE);
  
                  assert.ok(!error);
                  assert.equal(bytes, 0);
                  // We should call finished() here, but we have to work around
                  // https://github.com/joyent/node/issues/2867 on node 0.6,
                  // such that we don't close the socket within the `listening` event
                  // and pass a single message through instead.
                  socket.write(buf, 0, 'ascii', function () {
                    socket.close();
                  });
                });
              });
              server.on('metrics', function (message) {
                // We only expect to get our own test finished message, no stats
                assert.equal(message, TEST_FINISHED_MESSAGE);
                server.close();
                done();
              });
            });
          });
        });

        describe('#decrement', function () {
          describe('UDP', function () {
            it('should send count by -1 when no params are specified', function (done) {
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                }, index);
                statsd.decrement('test');
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:-1|c');
                server.close();
                done();
              });
            });

            it('should send proper count format with tags', function (done) {
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                }, index);
                statsd.decrement('test', 42, ['foo', 'bar']);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:-42|c|#foo,bar');
                server.close();
                done();
              });
            });

            it('should send proper count format with prefix, suffix, sampling and callback', function (done) {
              var called = false;
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  prefix: 'foo.',
                  suffix: '.bar'
                }, index);
                statsd.decrement('test', 42, 0.5, function () {
                  called = true;
                });
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'foo.test.bar:-42|c|@0.5');
                assert.equal(called, true);
                server.close();
                done();
              });
            });

            it('should properly send a and b with the same value', function (done) {
              var called = 0;
              var noOfMessages = 0;
              server = createUDPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port
                });
                statsd.decrement(['a', 'b'], null, function (error, bytes) {
                  called += 1;
                  assert.ok(called === 1); // Ensure it only gets called once
                  assert.equal(error, null);
                  assert.equal(bytes, 12);
                });
              });
              server.on('metrics', function (metric) {
                if (noOfMessages === 0) {
                  assert.equal(metric, 'a:-1|c');
                  noOfMessages += 1;
                } else {
                  assert.equal(metric, 'b:-1|c');
                  server.close();
                  done();
                }
              });
            });

            it('should send no increment stat when a mock Client is used', function (done) {
              var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
              server = createUDPServer(function (address) {
                statsd = createStatsdClient([
                  address.address, address.port, 'prefix', 'suffix', false, false, true
                ], index);
  
                // Regression test for "undefined is not a function" with missing
                // callback on mock instance
                statsd.decrement('test', 1);
  
                statsd.decrement('test', 1, null, function (error, bytes) {
                  var socket = dgram.createSocket("udp4");
                  var buf = new Buffer(TEST_FINISHED_MESSAGE);
  
                  assert.ok(!error);
                  assert.equal(bytes, 0);
                  // We should call finished() here, but we have to work around
                  // https://github.com/joyent/node/issues/2867 on node 0.6,
                  // such that we don't close the socket within the `listening` event
                  // and pass a single message through instead.
                  socket.send(buf, 0, buf.length, address.port, address.address, function () {
                    socket.close();
                  });
                });
              });
              server.on('metrics', function (message) {
                // We only expect to get our own test finished message, no stats
                assert.equal(message, TEST_FINISHED_MESSAGE);
                server.close();
                done();
              });
            });
          });

          describe('TCP', function () {
            it('should send count by -1 when no params are specified', function (done) {
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                }, index);
                statsd.decrement('test');
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:-1|c\n');
                server.close();
                done();
              });
            });

            it('should send proper count format with tags', function (done) {
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                }, index);
                statsd.decrement('test', 42, ['foo', 'bar']);
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'test:-42|c|#foo,bar\n');
                server.close();
                done();
              });
            });

            it('should send proper count format with prefix, suffix, sampling and callback', function (done) {
              var called = false;
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  prefix: 'foo.',
                  suffix: '.bar',
                  protocol: 'tcp'
                }, index);
                statsd.decrement('test', 42, 0.5, function () {
                  called = true;
                });
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'foo.test.bar:-42|c|@0.5\n');
                assert.equal(called, true);
                server.close();
                done();
              });
            });

            it('should properly send a and b with the same value', function (done) {
              var called = 0;
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address, 
                  port: address.port,
                  protocol: 'tcp'
                });
                statsd.decrement(['a', 'b'], 42, null, function (error, bytes) {
                  called += 1;
                  assert.ok(called === 1); // Ensure it only gets called once
                  assert.equal(error, null);
                  assert.equal(bytes, 0);
                });
              });
              server.on('metrics', function (metrics) {
                assert.equal(metrics, 'a:-42|c\nb:-42|c\n');
                server.close();
                done();
              });
            });

            it('should send no increment stat when a mock Client is used', function (done) {
              var TEST_FINISHED_MESSAGE = 'TEST_FINISHED';
              server = createTCPServer(function (address) {
                statsd = createStatsdClient({
                  host: address.address,
                  port: address.port,
                  prefix: 'prefix',
                  suffix: 'suffix',
                  mock: true,
                  protocol: 'tcp'
                }, index);
  
                // Regression test for "undefined is not a function" with missing
                // callback on mock instance
                statsd.decrement('test', 1);
  
                statsd.decrement('test', 1, null, function (error, bytes) {
                  var socket = net.connect(address.port, address.address);
                  var buf = new Buffer(TEST_FINISHED_MESSAGE);
  
                  assert.ok(!error);
                  assert.equal(bytes, 0);
                  // We should call finished() here, but we have to work around
                  // https://github.com/joyent/node/issues/2867 on node 0.6,
                  // such that we don't close the socket within the `listening` event
                  // and pass a single message through instead.
                  socket.write(buf, 0, 'ascii', function () {
                    socket.close();
                  });
                });
              });
              server.on('metrics', function (message) {
                // We only expect to get our own test finished message, no stats
                assert.equal(message, TEST_FINISHED_MESSAGE);
                server.close();
                done();
              });
            });
          });
        });
      });
    });
  });
};
