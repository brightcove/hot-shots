const dgram = require('dgram'),
  net = require('net');

// installed below, only if needed
let unixDgram;

const TCP = 'tcp';
const UDS = 'uds';
// UDP constant not needed/used, defaults to udp

const UDS_PATH_DEFAULT = '/var/run/datadog/dsd.socket';

module.exports = (instance, args) => {
  let socket;
  let errMessage;

  if (args.protocol === TCP) {
    try {
      socket = net.connect(args.port, args.host);
      socket.setKeepAlive(true);
    } catch (err) {
      errMessage = `Could not establish connection to ${args.host}:${args.port}: ${err}`;
    }
  } else if (args.protocol === UDS) {
    try {
      // this will not always be available, as noted in the error message below
      unixDgram = require('unix-dgram'); // eslint-disable-line global-require
    } catch (err) {
      errMessage =
        'The library unix_dgram, needed for the uds protocol to work, is not installed. You need to pick another protocol to use hot-shots.  See the hot-shots README for additional details.';
    }

    if (unixDgram) {
      const udsPath = args.path ? args.path : UDS_PATH_DEFAULT;
      try {
        socket = unixDgram.createSocket('unix_dgram');
        socket.connect(udsPath);
      } catch (err) {
        errMessage = `Could not establish UDS connection to ${udsPath}: ${err}`;
      }
    }
  } else {
    try {
      socket = dgram.createSocket('udp4');
    } catch (err) {
      errMessage = `Could not create socket: ${err}`;
    }
  }

  if (errMessage) {
    if (instance.errorHandler) {
      instance.errorHandler(new Error(errMessage));
    } else {
      console.error(errMessage);
    }
  }

  return socket;
};
