const dgram = require('dgram');
const net = require('net');
const { PROTOCOL } = require('./constants');

// Imported below, only if needed
let unixDgram;

const UDS_PATH_DEFAULT = '/var/run/datadog/dsd.socket';

// interface Transport {
//   emit(name: string, payload: any):void;
//   on(name: string, listener: Function):void;
//   removeListener(name: string, listener: Function):void;
//   send(buf: Buffer, callback: Function):void;
//   close():void;
// }
const createTcpTransport = args => {
  const socket = net.connect(args.port, args.host);
  socket.setKeepAlive(true);
  return {
    emit: socket.emit.bind(socket),
    on: socket.on.bind(socket),
    removeListener: socket.removeListener.bind(socket),
    send: (buf, callback) => {
      let msg = buf.toString();
      if (msg.length > 0 && msg[msg.length - 1] !== '\n') {
        msg += '\n';
      }
      socket.write(msg, 'ascii', callback);
    },
    close: () => socket.destroy()
  };
};

const createUdpTransport = args => {
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
  let transport = null;
  const protocol = args.protocol || PROTOCOL.UDP;

  try {
    if (protocol === PROTOCOL.TCP) {
      transport = createTcpTransport(args);
    } else if (protocol === PROTOCOL.UDS) {
      transport = createUdsTransport(args);
    } else if (protocol === PROTOCOL.UDP) {
      transport = createUdpTransport(args);
    } else {
      throw new Error(`Unsupported protocol '${protocol}'`);
    }
    transport.type = protocol;
  } catch (e) {
    if (instance.errorHandler) {
      instance.errorHandler(e);
    } else {
      console.error(e);
    }
  }

  return transport;
};
