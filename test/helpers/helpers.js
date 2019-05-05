const dgram = require('dgram');
const net = require('net');
const path = require('path');
const fs = require('fs');
const StatsD = require('../../lib/statsd.js');

let unixDgram;
try {
  // this will not always be available
  unixDgram = require('unix-dgram'); // eslint-disable-line global-require
}
catch (err) {
  // ignore, with better details showing up in the npm install
}

const CLIENT = 'client';
const CHILD_CLIENT = 'child client';
const CHILD_CHILD_CLIENT = 'child child client';
const TCP = 'tcp';
const UDP = 'udp';
const UDS = 'uds';
const TCP_BROKEN = 'tcp_broken';

// tcp puts a newline at the end but udp/uds do not
const TCP_METRIC_END = '\n';
const UDP_METRIC_END = '';
const UDS_METRIC_END = '';

const UDS_TEST_PATH = path.join(__dirname, 'test.sock');

// Since sampling uses random, we need to patch Math.random() to always give
// a consistent result
Math.random = () => {
  return 0.42;
};

/**
 * Close the server and stats client, waiting until both are really closed
 */
function closeAll(server, statsd, allowErrors, done) {
  if (! statsd) {
    statsd = { close: () => {} }; // eslint-disable-line no-empty-function
  }
  if (! server) {
    server = { close: () => {} }; // eslint-disable-line no-empty-function
  }
  try {
    statsd.close(() => {
      try {
        if (statsd.hasOwnProperty('protocol') && statsd.protocol === UDS) {
          server.close();
          // this one is synchronous
          done();
        }
        else {
          server.close(() => {
            done();
          });
        }
      }
      catch (err) {
        done(allowErrors ? null : err);
      }
    });
  }
  catch (err) {
    done(allowErrors ? null : err);
  }
}

/**
 * Returns all permutations of test types to run through
 */
function testTypes() {
  return [[`${UDS} ${CLIENT}`, UDS, CLIENT, UDS_METRIC_END]];

  // TODO: reenable full suite when done testing

  // TODO: do not include UDS if on Node 12 or Windows

  /* return [[`${UDP} ${CLIENT}`, UDP, CLIENT, UDP_METRIC_END],
    [`${UDP} ${CHILD_CLIENT}`, UDP, CHILD_CLIENT, UDP_METRIC_END],
    [`${UDP} ${CHILD_CHILD_CLIENT}`, UDP, CHILD_CHILD_CLIENT, UDP_METRIC_END],
    [`${TCP} ${CLIENT}`, TCP, CLIENT, TCP_METRIC_END],
    [`${TCP} ${CHILD_CLIENT}`, TCP, CHILD_CLIENT, TCP_METRIC_END],
    [`${UDS} ${CLIENT}`, UDS, CLIENT, UDS_METRIC_END],
    [`${UDS} ${CHILD_CLIENT}`, UDS, CHILD_CLIENT, UDS_METRIC_END]]; */
}

/**
 * Returns simple protocol types to test, ignoring child testing
 */
function testProtocolTypes() {
  // TODO: do not include UDS if on Node 12 or Windows
  return [[`${UDP} ${CLIENT}`, UDP, CLIENT, UDP_METRIC_END],
    [`${TCP} ${CLIENT}`, TCP, CLIENT, TCP_METRIC_END],
    [`${UDS} ${CLIENT}`, UDS, CLIENT, UDS_METRIC_END]];
}

/**
 * Create statsd server to send messages to for testing
 */
function createServer(serverType, onListening) {
  let server;
  if (serverType === UDP) {
    server = dgram.createSocket('udp4');
    server.on('message', message => {
      const metrics = message.toString();
      server.emit('metrics', metrics);
    });
    server.on('listening', () => {
      onListening(server.address());
    });

    server.bind(0, '127.0.0.1');
  }
  else if (serverType === UDS) {
    // we always have to manually unlink the test socket
    if (fs.existsSync(UDS_TEST_PATH)) { // eslint-disable-line no-sync
      fs.unlinkSync(UDS_TEST_PATH); // eslint-disable-line no-sync
    }

    server = unixDgram.createSocket('unix_dgram', buf => {
      const metrics = buf.toString();
      server.emit('metrics', metrics);
    });
    server.on('listening', () => {
      onListening('127.0.0.1');
    });
    server.on('error', (err) => {
      console.log('uds connection failed', err);
      onListening('127.0.0.1');
    });
    server.bind(UDS_TEST_PATH);
  }
  else if (serverType === TCP) {
    server = net.createServer(socket => {
      socket.setEncoding('ascii');
      socket.on('data', data => {
        if (data) {
          server.emit('metrics', data);
        }
      });
    });
    server.on('listening', () => {
      onListening(server.address());
    });

    server.listen(0, '127.0.0.1');
  }
  else if (serverType === TCP_BROKEN) {
    server = net.createServer(socket => {
      socket.setEncoding('ascii');
      socket.on('data', data => {
        if (data) {
          server.emit('metrics', data);
        }
      });
      socket.destroy();
    });
    server.on('listening', () => {
      onListening(server.address());
    });

    server.listen(0, '127.0.0.1');
  }
  else {
    throw new Error(`Unknown server type: ${serverType}`);
  }

  return server;
}

/**
 * Create hot-shots client for usage in tests
 *
 * @param {} args
 * @param {*} clientType
 */
function createHotShotsClient(args, clientType) {
  if (args.protocol === UDS) {
    args.path = UDS_TEST_PATH;
  }
   /* eslint-disable require-jsdoc */
  function construct(ctor, constructArgs) {
    function F() {
      return ctor.apply(this, constructArgs);
    }
    F.prototype = ctor.prototype;
    return new F();
  }
  const client = Array.isArray(args) ? construct(StatsD, args) : new StatsD(args);

  if (clientType === CLIENT) {
    return client;
  }
  else if (clientType === CHILD_CLIENT) {
    return client.childClient({});
  }
  else if (clientType === CHILD_CHILD_CLIENT) {
    return client.childClient({}).childClient({});
  }
  else {
    throw new Error(`Unknown client type: ${clientType}`);
  }
}

module.exports = {
  closeAll: closeAll,
  testTypes: testTypes,
  testProtocolTypes: testProtocolTypes,
  createServer: createServer,
  createHotShotsClient: createHotShotsClient,
};
