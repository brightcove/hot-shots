const dgram = require('dgram'),
  net = require('net');

// Imported below, only if needed
let unixDgram;

const TCP = 'tcp';
const UDS = 'uds';
// UDP constant not needed/used, defaults to udp

const UDS_PATH_DEFAULT = '/var/run/datadog/dsd.socket';

// interface Transport {
//   emit(name: string, payload: any):void;
//   on(name: string, listener: Function):void;
//   removeListener(name: string, listener: Function):void;
//   send(buf: Buffer, callback: Function):void;
//   close(callback: Function):void;
// }
const createTcpTransport = args => {
  const socket = net.connect(args.port, args.host);
  socket.setKeepAlive(true);
  return {
    emit: socket.emit.bind(socket),
    on: socket.on.bind(socket),
    removeListener: socket.removeListener.bind(socket),
    send: (buf, callback) => socket.write(buf, 'ascii', callback),
    close: () => socket.destroy(),
  };
};

const createUdpTransport = (args) => {
  const socket = dgram.createSocket('udp4');
  return {
    emit: socket.emit.bind(socket),
    on: socket.on.bind(socket),
    removeListener: socket.removeListener.bind(socket),
    send: (buf, callback) => socket.send(buf, 0, buf.length, args.port, args.host, callback),
    close: socket.close.bind(socket)
  };
};

const createUdsTransport = args => {
  try {
    // This will not always be available, as noted in the error message below
    unixDgram = require('unix-dgram'); // eslint-disable-line global-require
  } catch (err) {
    throw new Error(
      'The library `unix_dgram`, needed for the uds protocol to work, is not installed. ' +
        'You need to pick another protocol to use hot-shots. ' +
        'See the hot-shots README for additional details.'
    );
  }
  const udsPath = args.path ? args.path : UDS_PATH_DEFAULT;
  const socket = unixDgram.createSocket('unix_dgram');
  socket.connect(udsPath);

  return {
    emit: socket.emit.bind(socket),
    on: socket.on.bind(socket),
    removeListener: socket.removeListener.bind(socket),
    send: socket.send.bind(socket),
    close: () => {
      socket.close();
      // close is synchronous, and the socket will not emit a
      // close event, so we can callback right away
      socket.emit('close');
    }
  };
};

module.exports = (instance, args) => {
  let socket = null;

  try {
    if (args.protocol === TCP) {
      socket = createTcpTransport(args);
    } else if (args.protocol === UDS) {
      socket = createUdsTransport(args);
    } else {
      socket = createUdpTransport(args);
    }
  } catch (e) {
    console.log('transport error', e);
    if (instance.errorHandler) {
      instance.errorHandler(e);
    } else {
      console.error(e);
    }
  }

  return socket;
};
