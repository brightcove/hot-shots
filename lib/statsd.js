'use strict';

var dgram         = require('dgram'),
    util          = require('util'),
    dns           = require('dns'),
    net           = require('net'),
    helpers       = require('./helpers'),
    applyStatsFns = require('./statsFunctions');

/**
 * The UDP Client for StatsD
 * @param options
 *   @option host        {String}  The host to connect to default: localhost
 *   @option port        {String|Integer} The port to connect to default: 8125
 *   @option prefix      {String}  An optional prefix to assign to each stat name sent
 *   @option suffix      {String}  An optional suffix to assign to each stat name sent
 *   @option globalize   {boolean} An optional boolean to add 'statsd' as an object in the global namespace
 *   @option cacheDns    {boolean} An optional option to only lookup the hostname -> ip address once
 *   @option mock        {boolean} An optional boolean indicating this Client is a mock object, no stats are sent.
 *   @option globalTags {Array=} Optional tags that will be added to every metric
 *   @option errorHandler {Function=} Optional function to handle errors when callback is not provided
 *   @maxBufferSize      {Number} An optional value for aggregating metrics to send, mainly for performance improvement
 *   @bufferFlushInterval {Number} the time out value to flush out buffer if not
 *   @option sampleRate {Float} Global Sampling rate, default: 1 (No sampling)
 *   @option useDefaultRoute {boolean} An optional boolean to use the default route on Linux. Useful for containers
 * @constructor
 */
var Client = function (host, port, prefix, suffix, globalize, cacheDns, mock,
    globalTags, maxBufferSize, bufferFlushInterval, telegraf, sampleRate, protocol) {
  var options = host || {},
         self = this;

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

  var createSocket = function createSocket(instance, args) {
    var socket;
    var errMessage;

    if (args.protocol === 'tcp') {
      try {
        socket = net.connect(args.port, args.host);
        socket.setKeepAlive(true);
      } catch (e) {
        errMessage = 'Could not establish connection to ' + args.host + ':' + args.port;
        if (instance.errorHandler) {
          instance.errorHandler(new Error(errMessage));
        } else {
          console.log(errMessage);
        }
      }
    } else {
      socket = dgram.createSocket('udp4');
    }

    return socket;
  };

  // hidden global_tags option for backwards compatibility
  options.globalTags = options.globalTags || options.global_tags;

  this.protocol    = (options.protocol && options.protocol.toLowerCase());
  this.host        = options.host || 'localhost';
  this.port        = options.port || 8125;
  this.prefix      = options.prefix || '';
  this.suffix      = options.suffix || '';
  this.socket      = options.isChild ? options.socket : createSocket(this, {
    host: this.host,
    port: this.port,
    protocol: this.protocol
  });
  this.mock        = options.mock;
  this.globalTags  = typeof options.globalTags === 'object' ?
      helpers.formatTags(options.globalTags, options.telegraf) : [];
  this.telegraf    = options.telegraf || false;
  this.maxBufferSize = options.maxBufferSize || 0;
  this.sampleRate  = options.sampleRate || 1;
  this.bufferFlushInterval = options.bufferFlushInterval || 1000;
  this.bufferHolder = options.isChild ? options.bufferHolder : { buffer: '' };
  this.errorHandler = options.errorHandler;

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
  } else if (options.cacheDns === true) {
    dns.lookup(options.host, function (err, address, family) {
      if (err === null) {
        self.host = address;
      } else {
        self.dnsError = err;
      }
    });
  }

  if (!options.isChild && options.errorHandler) {
    this.socket.on('error', options.errorHandler);
  }

  if (options.globalize) {
    global.statsd = this;
  }

  if (options.useDefaultRoute) {
    var defaultRoute = helpers.getDefaultRoute();
    if (defaultRoute) {
      console.log('Got ' + defaultRoute + ' for the system\'s default route');
      this.host = defaultRoute;
    }
  }

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
  var completed = 0,
      calledback = false,
      sentBytes = 0,
      self = this;

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
    stat.forEach(function (item) {
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
  var message = this.prefix + stat + this.suffix + ':' + value + '|' + type;

  sampleRate = sampleRate || this.sampleRate;
  if (sampleRate && sampleRate < 1) {
    if (Math.random() < sampleRate) {
      message += '|@' + sampleRate;
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
  var mergedTags = this.globalTags;
  if (tags && typeof tags === 'object') {
    mergedTags = helpers.overrideTags(mergedTags, tags, this.telegraf);
  }
  if (mergedTags.length > 0) {
    if (this.telegraf) {
      message = message.split(':');
      message = message[0] + ',' + mergedTags.join(',').replace(/:/g, '=') + ':' + message.slice(1).join(':');
    } else {
      message += '|#' + mergedTags.join(',');
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
  // Guard against 'RangeError: Offset into buffer too large' in node 0.10
  // https://github.com/nodejs/node-v0.x-archive/issues/7884
  if (message === '') {
    if (callback) {
      callback(null);
    }
    return;
  }

  if (this.protocol === 'tcp' && message.lastIndexOf('\n') !== message.length - 1) {
    message += '\n';
  }

  var buf = new Buffer(message);
  try {
    if (this.protocol === 'tcp') {
      this.socket.write(buf, 'ascii', callback);
    } else {
      this.socket.send(buf, 0, buf.length, this.port, this.host, callback);
    }
  } catch (err) {
    var errMessage = 'Error sending hot-shots message: ' + err;
    if (callback) {
      callback(new Error(errMessage));
    } else if (this.errorHandler) {
      this.errorHandler(new Error(errMessage));
    } else {
      console.log(errMessage);
    }
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
  if (this.intervalHandle) {
    clearInterval(this.intervalHandle);
  }

  this.flushQueue();

  if (callback) {
    // use the close event rather than adding a callback to close()
    // because that API is not available in older Node versions
    this.socket.on('close', callback);
  }

  try {
    if (this.protocol === 'tcp') {
      this.socket.destroy();
    } else {
      this.socket.close();
    }
  } catch (err) {
    var errMessage = 'Error closing hot-shots socket: ' + err;
    if (callback) {
      callback(new Error(errMessage));
    } else if (this.errorHandler) {
      this.errorHandler(new Error(errMessage));
    } else {
      console.log(errMessage);
    }
  }
};

var ChildClient = function (parent, options) {
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
