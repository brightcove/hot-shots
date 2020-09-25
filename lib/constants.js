exports.PROTOCOL = {
  TCP: 'tcp',
  UDS: 'uds',
  UDP: 'udp',
  STREAM: 'stream'
};

function udsErrors() {
  return [107, 111];
};

exports.udsErrors = udsErrors;
