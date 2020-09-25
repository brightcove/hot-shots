const os = require('os'),
  process = require('process');

exports.PROTOCOL = {
  TCP: 'tcp',
  UDS: 'uds',
  UDP: 'udp',
  STREAM: 'stream'
};

function udsErrors() {
  if (process.platform == 'linux') {
    return [
      os.constants.errno.ENOTCONN,
      os.constants.errno.ECONNREFUSED,
    ]
  }

  if (process.platform == 'darwin') {
    return [
      os.constants.errno.EDESTADDRREQ,
      os.constants.errno.ECONNRESET,
    ]
  }

  // Unknown / not yet implemented
  return []
};

exports.udsErrors = udsErrors;
