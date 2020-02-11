const util = require('util'),
  dns = require('dns'),
  helpers = require('./helpers'),
  applyStatsFns = require('./statsFunctions');

const { PROTOCOL } = require('./constants');
const createTransport = require('./transport');

const UDS_DEFAULT_GRACEFUL_RESTART_LIMIT = 1000;

/**
 * The Client for StatsD.  The main entry-point for hot-shots.  Note adding new parameters
 * to the constructor is deprecated- please use the constructor as one options object.
 * @constructor
 */
const Client = function (host, port, prefix, suffix, globalize, cacheDns, mock,
    globalTags, maxBufferSize, bufferFlushInterval, telegraf, sampleRate, protocol) {
  let options = host || {};

  // Adding options below is DEPRECATED.  Use the options object instead.
  if (arguments.length > 1 || typeof(host) === 'string') {
    options = {
      host        : host,
      port        : port,
      prefix      : prefix,
      suffix      : suffix,
      globalize   : globalize,
      cacheDns    : cacheDns,
      mock        : mock === true,
      globalTags  : globalTags,
      maxBufferSize : maxBufferSize,
      bufferFlushInterval: bufferFlushInterval,
      telegraf    : telegraf,
      sampleRate  : sampleRate,
      protocol    : protocol
    };
  }


  // hidden global_tags option for backwards compatibility
  options.globalTags = options.globalTags || options.global_tags;

  this.protocol = (options.protocol && options.protocol.toLowerCase());
  if (! this.protocol) {
    this.protocol = PROTOCOL.UDP;
  }
  this.host = options.host || process.env.DD_AGENT_HOST || 'localhost';
  this.port = options.port || parseInt(process.env.DD_DOGSTATSD_PORT, 10) || 8125;
  this.prefix = options.prefix || '';
  this.suffix = options.suffix || '';
  this.mock        = options.mock;
  this.globalTags  = typeof options.globalTags === 'object' ?
      helpers.formatTags(options.globalTags, options.telegraf) : [];
  if (process.env.DD_ENTITY_ID) {
    this.globalTags = this.globalTags.filter((item) => {
      return item.indexOf('dd.internal.entity_id:') !== 0;
   });
    this.globalTags.push('dd.internal.entity_id:'.concat(helpers.sanitizeTags(process.env.DD_ENTITY_ID)));
  }
  this.telegraf = options.telegraf || false;
  this.maxBufferSize = options.maxBufferSize || 0;
  this.sampleRate = options.sampleRate || 1;
  this.bufferFlushInterval = options.bufferFlushInterval || 1000;
  this.bufferHolder = options.isChild ? options.bufferHolder : { buffer: '' };
  this.errorHandler = options.errorHandler;
  this.udsGracefulErrorHandling = 'udsGracefulErrorHandling' in options ? options.udsGracefulErrorHandling : true;

  // If we're mocking the client, create a buffer to record the outgoing calls.
  if (this.mock) {
    this.mockBuffer = [];
  }

  // We only want a single flush event per parent and all its child clients
  if (!options.isChild && this.maxBufferSize > 0) {
    this.intervalHandle = setInterval(this.onBufferFlushInterval.bind(this), this.bufferFlushInterval);
  }

  if (options.isChild) {
    if (options.dnsError) {
      this.dnsError = options.dnsError;
    }
    this.socket = options.socket;
  } else if (options.useDefaultRoute) {
    const defaultRoute = helpers.getDefaultRoute();
    if (defaultRoute) {
      console.log(`Got ${defaultRoute} for the system's default route`);
      this.host = defaultRoute;
    }
  }

  if (! this.socket) {
    this.socket = createTransport(this, {
      host: this.host,
      path: options.path,
      port: this.port,
      protocol: this.protocol,
      stream: options.stream
    });
  }

  if (options.cacheDns === true && this.protocol === PROTOCOL.UDP) {
    dns.lookup(this.host, (err, address) => {
      if (err === null) {
        this.host = address;
        // update for uds to use for each send call
        this.socket.setHost = this.host;
      } else {
        this.dnsError = err;
      }
    });
  }

  if (!options.isChild && options.errorHandler) {
    this.socket.on('error', options.errorHandler);
  }

  if (options.globalize) {
    global.statsd = this;
  }

  // only for uds (options.protocol uds)
  // enabled with the extra flag options.udsGracefulErrorHandling
  // will gracefully (attempt) to re-open the socket with a small delay
  // options.udsGracefulRestartRateLimit is the minimum time (ms) between creating sockets
  // does not support options.isChild (how to re-create a socket you didn't create?)
  if (!options.isChild && options.protocol === PROTOCOL.UDS && options.udsGracefulErrorHandling) {
    const socketCreateLimit = options.udsGracefulRestartRateLimit || UDS_DEFAULT_GRACEFUL_RESTART_LIMIT; // only recreate once per second
    const lastSocketCreateTime = Date.now();
    this.socket.on('error', (err) => {
      const code = err.code;
      switch (code) {
        case 107:
        case 111: {
          if (Date.now() - lastSocketCreateTime >= socketCreateLimit) {
            // recreate the socket, but only once per 30 seconds
            if (this.errorHandler) {
              this.socket.removeListener('error', this.errorHandler);
            }
            this.socket.close();
            this.socket = createTransport(this, {
              host: this.host,
              path: options.path,
              port: this.port,
              protocol: this.protocol
            });

            if (this.errorHandler) {
              this.socket.on('error', this.errorHandler);
            } else {
              this.socket.on('error', error => console.error(`hot-shots UDS error: ${error}`));
            }
          }
          break;
        }
        default: {
          break;
        }
      }
    });
  }


  this.messagesInFlight = 0;
  this.CHECKS = {
    OK: 0,
    WARNING: 1,
    CRITICAL: 2,
    UNKNOWN: 3,
  };
};

applyStatsFns(Client);

/**
 * Checks if stats is an array and sends all stats calling back once all have sent
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param type The type of the metric
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.sendAll = function (stat, value, type, sampleRate, tags, callback) {
  let completed = 0;
  let calledback = false;
  let sentBytes = 0;
  const self = this;

  if (sampleRate && typeof sampleRate !== 'number') {
    callback = tags;
    tags = sampleRate;
    sampleRate = undefined;
  }

  if (tags && typeof tags !== 'object') {
    callback = tags;
    tags = undefined;
  }

  /**
   * Gets called once for each callback, when all callbacks return we will
   * call back from the function
   * @private
   */
  function onSend(error, bytes) {
    completed += 1;
    if (calledback) {
      return;
    }

    if (error) {
      if (typeof callback === 'function') {
        calledback = true;
        callback(error);
      } else if (self.errorHandler) {
        calledback = true;
        self.errorHandler(error);
      }
      return;
    }

    if (bytes) {
      sentBytes += bytes;
    }

    if (completed === stat.length && typeof callback === 'function') {
      callback(null, sentBytes);
    }
  }

  if (Array.isArray(stat)) {
    stat.forEach(item => {
      self.sendStat(item, value, type, sampleRate, tags, onSend);
    });
  } else {
    this.sendStat(stat, value, type, sampleRate, tags, callback);
  }
};

/**
 * Sends a stat across the wire
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param type {String} The type of message to send to statsd
 * @param sampleRate {Number} The Number of times to sample (0 to 1)
 * @param tags {Array} The Array of tags to add to metrics
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.sendStat = function (stat, value, type, sampleRate, tags, callback) {
  let message = `${this.prefix + stat + this.suffix}:${value}|${type}`;
  sampleRate = sampleRate || this.sampleRate;
  if (sampleRate && sampleRate < 1) {
    if (Math.random() < sampleRate) {
      message += `|@${sampleRate}`;
    } else {
      // don't want to send if we don't meet the sample ratio
      return callback ? callback() : undefined;
    }
  }
  this.send(message, tags, callback);
};

/**
 * Send a stat or event across the wire
 * @param message {String} The constructed message without tags
 * @param tags {Array} The tags to include (along with global tags). Optional.
 * @param callback {Function=} Callback when message is done being delivered (only if maxBufferSize == 0). Optional.
 */
Client.prototype.send = function (message, tags, callback) {
  let mergedTags = this.globalTags;
  if (tags && typeof tags === 'object') {
    mergedTags = helpers.overrideTags(mergedTags, tags, this.telegraf);
  }
  if (mergedTags.length > 0) {
    if (this.telegraf) {
      message = message.split(':');
      message = `${message[0]},${mergedTags.join(',').replace(/:/g, '=')}:${message.slice(1).join(':')}`;
    } else {
      message += `|#${mergedTags.join(',')}`;
    }
  }

  this._send(message, callback);
};

/**
 * Send a stat or event across the wire
 * @param message {String} The constructed message without tags
 * @param callback {Function=} Callback when message is done being delivered (only if maxBufferSize == 0). Optional.
 */
Client.prototype._send = function (message, callback) {
  // we may have a cached error rather than a cached lookup, so
  // throw it on
  if (this.dnsError) {
    if (callback) {
      return callback(this.dnsError);
    } else if (this.errorHandler) {
      return this.errorHandler(this.dnsError);
    }
    throw this.dnsError;
  }

  // Only send this stat if we're not a mock Client.
  if (!this.mock) {
    if (this.maxBufferSize === 0) {
      this.sendMessage(message, callback);
    } else {
      this.enqueue(message, callback);
    }
  } else {
    this.mockBuffer.push(message);
    if (typeof callback === 'function') {
      callback(null, 0);
    }
  }
};

/**
 * Add the message to the buffer and flush the buffer if needed
 *
 * @param message {String} The constructed message without tags
 */
Client.prototype.enqueue = function (message, callback) {
  message += '\n';

  if (this.bufferHolder.buffer.length + message.length > this.maxBufferSize) {
    this.flushQueue(callback);
    this.bufferHolder.buffer += message;
  }
  else {
    this.bufferHolder.buffer += message;
    if (callback) {
      callback(null);
    }
  }
};

/**
 * Flush the buffer, sending on the messages
 */
Client.prototype.flushQueue = function (callback) {
  this.sendMessage(this.bufferHolder.buffer, callback);
  this.bufferHolder.buffer = '';
};

/**
 * Send on the message through the socket
 *
 * @param message {String} The constructed message without tags
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.sendMessage = function (message, callback) {
  // don't waste the time if we aren't sending anything
  if (message === '') {
    if (callback) {
      callback(null);
    }
    return;
  }

  if (!this.socket) {
    const error = 'Socket not created properly. Check previous errors for details.';
    if (callback) {
      return callback(new Error(error));
    } else {
      return console.error(error);
    }
  }

  const handleCallback = (err, bytes) => {
    this.messagesInFlight--;
    const errFormatted = err ? new Error(`Error sending hot-shots message: ${err}`) : null;
    if (errFormatted) {
      errFormatted.code = err.code;
    }
    if (callback) {
      callback(errFormatted, bytes);
    } else if (errFormatted) {
      if (this.errorHandler) {
        this.errorHandler(errFormatted);
      } else {
        console.error(String(errFormatted));
        // emit error ourselves on the socket for backwards compatibility
        this.socket.emit('error', errFormatted);
      }
    }
  };

  try {
    this.messagesInFlight++;
    this.socket.send(Buffer.from(message), handleCallback);
  } catch (err) {
    handleCallback(err);
  }
};

/**
 * Called every bufferFlushInterval to flush any buffer that is around
 */
Client.prototype.onBufferFlushInterval = function () {
  this.flushQueue();
};

/**
 * Close the underlying socket and stop listening for data on it.
 */
Client.prototype.close = function (callback) {
  // stop trying to flush the queue on an interval
  if (this.intervalHandle) {
    clearInterval(this.intervalHandle);
  }

  // flush the queue one last time, if needed
  this.flushQueue((err) => {
    if (err) {
      if (callback) {
        return callback(err);
      }
      else {
        return console.error(err);
      }
    }

    // FIXME: we have entered callback hell, and this whole file is in need of an async rework

    // wait until there are no more messages in flight before really closing the socket
    let intervalAttempts = 0;
    const waitForMessages = setInterval(() => {
      intervalAttempts++;
      if (intervalAttempts > 10) {
        console.log('hot-shots could not clear out messages in flight but closing anyways');
        this.messagesInFlight = 0;
      }
      if (this.messagesInFlight <= 0) {
        clearInterval(waitForMessages);
        this._close(callback);
      }
    }, 50);
  });
};

/**
 * Really close the socket and handle any errors related to it
 */
Client.prototype._close = function (callback) {
  // error function to use in callback and catch below
  let handledError = false;
  const handleErr = (err) => {
    const errMessage = `Error closing hot-shots socket: ${err}`;
    if (handledError) {
      console.error(errMessage);
    }
    else {
      // The combination of catch and error can lead to some errors
      // showing up twice.  So we just show one of the errors that occur
      // on close.
      handledError = true;

      if (callback) {
        callback(new Error(errMessage));
      } else if (this.errorHandler) {
        this.errorHandler(new Error(errMessage));
      } else {
        console.error(errMessage);
      }
    }
  };

  if (this.errorHandler) {
    this.socket.removeListener('error', this.errorHandler);
  }

  // handle error and close events
  this.socket.on('error', handleErr);
  if (callback) {
    this.socket.on('close', err => {
      if (! handledError && callback) {
        callback(err);
      }
    });
  }

  try {
    this.socket.close();
  } catch (err) {
    handleErr(err);
  }
};

const ChildClient = function (parent, options) {
  options = options || {};
  Client.call(this, {
    isChild     : true,
    socket      : parent.socket, // Child inherits socket from parent. Parent itself can be a child.
    // All children and parent share the same buffer via sharing an object (cannot mutate strings)
    bufferHolder: parent.bufferHolder,
    dnsError    : parent.dnsError, // Child inherits an error from parent (if it is there)
    errorHandler: options.errorHandler || parent.errorHandler, // Handler for callback errors
    host        : parent.host,
    port        : parent.port,
    prefix      : (options.prefix || '') + parent.prefix, // Child has its prefix prepended to parent's prefix
    suffix      : parent.suffix + (options.suffix || ''), // Child has its suffix appended to parent's suffix
    globalize   : false, // Only 'root' client can be global
    mock        : parent.mock,
    // Append child's tags to parent's tags
    globalTags  : typeof options.globalTags === 'object' ?
        helpers.overrideTags(parent.globalTags, options.globalTags, parent.telegraf) : parent.globalTags,
    maxBufferSize : parent.maxBufferSize,
    bufferFlushInterval: parent.bufferFlushInterval,
    telegraf    : parent.telegraf,
    protocol    : parent.protocol
  });
};
util.inherits(ChildClient, Client);

/**
 * Creates a child client that adds prefix, suffix and/or tags to this client. Child client can itself have children.
 * @param options
 *   @option prefix      {String}  An optional prefix to assign to each stat name sent
 *   @option suffix      {String}  An optional suffix to assign to each stat name sent
 *   @option globalTags {Array=} Optional tags that will be added to every metric
 */
Client.prototype.childClient = function (options) {
  return new ChildClient(this, options);
};

exports = module.exports = Client;
exports.StatsD = Client;
