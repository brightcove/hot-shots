'use strict';

var assert = require('assert');

var createStatsdClient = require('./helpers').createStatsdClient;
var createTCPServer = require('./helpers').createTCPServer;
var createUDPServer = require('./helpers').createUDPServer;

module.exports = function runSendAllMethodTestSuite() {
  describe('#sendAll', function () {
    var server;
    var statsd;

    afterEach(function () {
      server = null;
      statsd = null;
    });

    ['main client', 'child client', 'child of child client'].forEach(function (description, index) {
      describe(description, function () {
        describe('UDP', function () {
          it('should use errorHandler', function (done) {
            server = createUDPServer(function (address) {
              var err = new Error('Boom!');
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                errorHandler: function (e) {
                  assert.equal(e, err);
                }
              }, index);
              statsd.sendStat = function (item, value, type, sampleRate, tags, callback) {
                callback(err);
              };
              statsd.sendAll(['test title'], 'another desc');
              statsd.close(function () {
                server.close();
                done();
              });
            });
          });
        });

        describe('TCP', function () {
          it('should use errorHandler', function (done) {
            server = createTCPServer(function (address) {
              var err = new Error('Boom!');
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp',
                errorHandler: function (e) {
                  assert.equal(e, err);
                }
              }, index);
              statsd.sendStat = function (item, value, type, sampleRate, tags, callback) {
                callback(err);
              };
              statsd.sendAll(['test title'], 'another desc');
              statsd.close(function () {
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
