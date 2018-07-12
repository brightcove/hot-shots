'use strict';

var dgram = require('dgram');
var net = require('net');

function createTCPServer(onListening) {
  var server = net.createServer(function (socket) {
    socket.setEncoding('ascii');
    socket.on('data', function (data) {
      var metrics;
      if (data) {
        metrics = data.split('\n').filter(function (part) {
          return part !== '';
        });
        server.emit('metrics', metrics);
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
  createTCPServer: createTCPServer,
  createUDPServer: createUDPServer
};
