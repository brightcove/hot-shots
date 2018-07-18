'use strict';

var dgram = require('dgram');
var net = require('net');

var StatsD = require('../lib/statsd');

function createStatsdClient(args, noOfChildren) {
  function construct(ctor, args) {
    function F() {
      return ctor.apply(this, args);
    }
    F.prototype = ctor.prototype;
    return new F();
  }
  var client = Array.isArray(args) ? construct(StatsD, args) : new StatsD(args);

  switch (noOfChildren) {
    case 0:
      return client;
    case 1:
      return client.childClient({});
    case 2:
      return client.childClient({}).childClient({});
    default:
      return client;
  }
}

function createTCPServer(onListening) {
  var server = net.createServer(function (socket) {
    socket.setEncoding('ascii');
    socket.on('data', function (data) {
      if (data) {
        server.emit('metrics', data);
      }
    });
  });

  server.on('listening', function () {
    onListening(server.address());
  });

  server.listen(0, '127.0.0.1');
  return server;
}

function createUDPServer(onListening){
  var server = dgram.createSocket("udp4");
  server.on('message', function(message){
    var metrics = message.toString();
    server.emit('metrics', metrics);
  });

  server.on('listening', function(){
    onListening(server.address());
  });

  server.bind(0, '127.0.0.1');
  return server;
}

module.exports = {
  createStatsdClient: createStatsdClient,
  createTCPServer: createTCPServer,
  createUDPServer: createUDPServer
};
