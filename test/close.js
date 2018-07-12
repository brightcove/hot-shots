'use strict';

var assert = require('assert');

var createStatsdClient = require('./helpers').createStatsdClient;
var createTCPServer = require('./helpers').createTCPServer;
var createUDPServer = require('./helpers').createUDPServer;

module.exports = function runCloseMethodTestSuite() {
  describe('#close', function () {
    var server;
    var statsd;

    afterEach(function () {
      server = null;
      statsd = null;
    });

    ['main client', 'child client', 'child of child client'].forEach(function (description, index) {
      describe(description, function () {
        describe('UDP', function () {
          it('should call callback after close call', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port
              }, index);
              statsd.close(function () {
                server.close();
                done();
              });
            });
          });

          it('should use errorHandler', function (done) {
            server = createUDPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                errorHandler: function (e) {
                  server.close();
                  done();
                }
              }, index);
              statsd.socket.close = function () {
                throw new Error('Boom!');
              };
              statsd.close();
            });
          });
        });

        describe('TCP', function () {
          it('should call callback after close call', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp'
              }, index);
              statsd.close(function () {
                server.close();
                done();
              });
            });
          });

          it('should use errorHandler', function (done) {
            server = createTCPServer(function (address) {
              statsd = createStatsdClient({
                host: address.address, 
                port: address.port,
                protocol: 'tcp',
                errorHandler: function (e) {
                  server.close();
                  done();
                }
              }, index);
              statsd.socket.destroy = function () {
                throw new Error('Boom!');
              };
              statsd.close();
            });
          });
        });
      });
    });
  });
};
