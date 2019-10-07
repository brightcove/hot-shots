const dgram = require('dgram'),
  net = require('net');

// installed below, only if needed
let unixDgram;

const TCP = 'tcp';
const UDS = 'uds';
// UDP constant not needed/used, defaults to udp

const UDS_PATH_DEFAULT = '/var/run/datadog/dsd.socket';

// const createTcpTransport = (instance, args) => {};

module.exports = (instance, args) => {
  let socket;
  // let errMessage;

  try {
    if (args.protocol === TCP) {
      socket = net.connect(args.port, args.host);
      socket.setKeepAlive(true);
    } else if (args.protocol === UDS) {
      try {
        // this will not always be available, as noted in the error message below
        unixDgram = require('unix-dgram'); // eslint-disable-line global-require
      } catch (err) {
        throw new Error(
          'The library `unix_dgram`, needed for the uds protocol to work, is not installed. ' +
            'You need to pick another protocol to use hot-shots. ' +
            'See the hot-shots README for additional details.'
        );
      }

      if (unixDgram) {
        const udsPath = args.path ? args.path : UDS_PATH_DEFAULT;
        socket = unixDgram.createSocket('unix_dgram');
        socket.connect(udsPath);
      }
    } else {
      socket = dgram.createSocket('udp4');
    }
  } catch (e) {
    if (instance.errorHandler) {
      instance.errorHandler(e);
    } else {
      console.error(e);
    }
  }

  return socket;
};
