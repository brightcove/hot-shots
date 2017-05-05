"use strict";

var dgram = require('dgram'),
    util = require('util'),
    dns   = require('dns');

/**
 * The UDP Client for StatsD
 * @param options
 *   @option host        {String}  The host to connect to default: localhost
 *   @option port        {String|Integer} The port to connect to default: 8125
 *   @option prefix      {String}  An optional prefix to assign to each stat name sent
 *   @option suffix      {String}  An optional suffix to assign to each stat name sent
 *   @option globalize   {boolean} An optional boolean to add "statsd" as an object in the global namespace
 *   @option cacheDns    {boolean} An optional option to only lookup the hostname -> ip address once
 *   @option mock        {boolean} An optional boolean indicating this Client is a mock object, no stats are sent.
 *   @option globalTags {Array=} Optional tags that will be added to every metric
 *   @option errorHandler {Function=} Optional function to handle errors when callback is not provided
 *   @maxBufferSize      {Number} An optional value for aggregating metrics to send, mainly for performance improvement
 *   @bufferFlushInterval {Number} the time out value to flush out buffer if not
 *   @option sampleRate {Float} Global Sampling rate, default: 1 (No sampling)
 * @constructor
 */
var Client = function (host, port, prefix, suffix, globalize, cacheDns, mock,
    globalTags, maxBufferSize, bufferFlushInterval, telegraf, sampleRate) {
  var options = host || {},
         self = this;

  if(arguments.length > 1 || typeof(host) === 'string'){
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
      sampleRate    : sampleRate
    };
  }

  this.host        = options.host || 'localhost';
  this.port        = options.port || 8125;
  this.prefix      = options.prefix || '';
  this.suffix      = options.suffix || '';
  this.socket      = options.isChild ? options.socket : dgram.createSocket('udp4');
  this.mock        = options.mock;
  this.globalTags  = Array.isArray(options.globalTags) ? options.globalTags : [];
  this.telegraf    = options.telegraf || false;
  this.maxBufferSize = options.maxBufferSize || 0;
  this.sampleRate  = options.sampleRate || 1;
  this.bufferFlushInterval = options.bufferFlushInterval || 1000;
  this.bufferHolder = options.isChild ? options.bufferHolder : { buffer: "" };
  this.errorHandler = options.errorHandler;

  // We only want a single flush event per parent and all its child clients
  if(!options.isChild && this.maxBufferSize > 0) {
    this.intervalHandle = setInterval(this.onBufferFlushInterval.bind(this), this.bufferFlushInterval);
  }

  if (options.isChild) {
    if (options.dnsError) {
      this.dnsError = options.dnsError;
    }
  } else if (options.cacheDns === true){
    dns.lookup(options.host, function(err, address, family){
      if(err === null){
        self.host = address;
      } else {
        self.dnsError = err;
      }
    });
  }

  if (!options.isChild && options.errorHandler) {
    this.socket.on('error', options.errorHandler);
  }

  if(options.globalize){
    global.statsd = this;
  }

  this.CHECKS = {
    OK: 0,
    WARNING: 1,
    CRITICAL: 2,
    UNKNOWN: 3,
  };
};

/**
 * Represents the timing stat
 * @param stat {String|Array} The stat(s) to send
 * @param time {Number} The time in milliseconds to send
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.timing = function (stat, time, sampleRate, tags, callback) {
  this.sendAll(stat, time, 'ms', sampleRate, tags, callback);
};

/**
 * Increments a stat by a specified amount
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.increment = function (stat, value, sampleRate, tags, callback) {
  // allow use of tags without explicit value or sampleRate
  if (arguments.length < 3) {
    if (typeof value !== 'number') {
      tags = value;
      value = undefined;
    }
  }
  // we explicitly check for undefined and null (and don't do a "! value" check)
  // so that 0 values are allowed and sent through as-is
  if (value === undefined || value === null) {
    value = 1;
  }
  this.sendAll(stat, value, 'c', sampleRate, tags, callback);
};

/**
 * Decrements a stat by a specified amount
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.decrement = function (stat, value, sampleRate, tags, callback) {
  this.sendAll(stat, -value || -1, 'c', sampleRate, tags, callback);
};

/**
 * Represents the histogram stat
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.histogram = function (stat, value, sampleRate, tags, callback) {
  this.sendAll(stat, value, 'h', sampleRate, tags, callback);
};


/**
 * Gauges a stat by a specified amount
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.gauge = function (stat, value, sampleRate, tags, callback) {
  this.sendAll(stat, value, 'g', sampleRate, tags, callback);
};

/**
 * Counts unique values by a specified amount
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.unique =
Client.prototype.set = function (stat, value, sampleRate, tags, callback) {
  this.sendAll(stat, value, 's', sampleRate, tags, callback);
};

/**
 * Send a service check
 * @param name {String} The name of the service check
 * @param status {Number=} The status of the service check (0 to 3).
 * @param options
 *   @option date_happened {Date} Assign a timestamp to the event. Default is now.
 *   @option hostname {String} Assign a hostname to the check.
 *   @option message {String} Assign a message to the check.
 * @param tags {Array=} The Array of tags to add to the check. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.check = function(name, status, options, tags, callback) {
  if (this.telegraf) {
    var err = new Error('Not supported by Telegraf / InfluxDB');
    if (callback) {
      return callback(err);
    }
    else if (this.errorHandler) {
      return this.errorHandler(err);
    }

    throw err;
  }
  var check = ['_sc', name, status],
    metadata = options || {};

  if (metadata.date_happened) {
    var timestamp = formatDate(metadata.date_happened);
    if (timestamp) {
      check.push('d:' + timestamp);
    }
  }
  if (metadata.hostname) {
    check.push('h:' + metadata.hostname);
  }

  var mergedTags = this.globalTags;
  if (tags && Array.isArray(tags)) {
    mergedTags = overrideTags(mergedTags, tags);
  }
  if (mergedTags.length > 0) {
    check.push('#' + mergedTags.join(','));
  }

  // message has to be the last part of a service check
  if (metadata.message) {
    check.push('m:' + metadata.message);
  }

  // allow for tags to be omitted and callback to be used in its place
  if(typeof tags === 'function' && callback === undefined) {
    callback = tags;
  }

  var message = check.join('|');
  // Service checks are unique in that message has to be the last element in
  // the stat if provided, so we can't append tags like other checks. This
  // directly calls the `_send` method to avoid appending tags, since we've
  // already added them.
  this._send(message, callback);
};

/**
 * Send on an event
 * @param title {String} The title of the event
 * @param text {String} The description of the event.  Optional- title is used if not given.
 * @param options
 *   @option date_happened {Date} Assign a timestamp to the event. Default is now.
 *   @option hostname {String} Assign a hostname to the event.
 *   @option aggregation_key {String} Assign an aggregation key to the event, to group it with some others.
 *   @option priority {String} Can be ‘normal’ or ‘low’. Default is 'normal'.
 *   @option source_type_name {String} Assign a source type to the event.
 *   @option alert_type {String} Can be ‘error’, ‘warning’, ‘info’ or ‘success’. Default is 'info'.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.event = function(title, text, options, tags, callback) {
  if (this.telegraf) {
    var err = new Error('Not supported by Telegraf / InfluxDB');
    if (callback) {
      return callback(err);
    }
    else if (this.errorHandler) {
      return this.errorHandler(err);
    }

    throw err;
  }

  // Convert to strings
  var message,
      msgTitle = String(title ? title : ''),
      msgText = String(text ? text : msgTitle);
  // Escape new lines (unescaping is supported by DataDog)
  msgText = msgText.replace(/\n/g, '\\n');

  // start out the message with the event-specific title and text info
  message = '_e{' + msgTitle.length + ',' + msgText.length + '}:' + msgTitle + '|' + msgText;

  // add in the event-specific options
  if (options) {
    if (options.date_happened) {
      var timestamp = formatDate(options.date_happened);
      if (timestamp) {
        message += '|d:' + timestamp;
      }
    }
    if (options.hostname) {
      message += '|h:' + options.hostname;
    }
    if (options.aggregation_key) {
      message += '|k:' + options.aggregation_key;
    }
    if (options.priority) {
      message += '|p:' + options.priority;
    }
    if (options.source_type_name) {
      message += '|s:' + options.source_type_name;
    }
    if (options.alert_type) {
      message += '|t:' + options.alert_type;
    }
  }

  // allow for tags to be omitted and callback to be used in its place
  if(typeof tags === 'function' && callback === undefined) {
    callback = tags;
  }

  this.send(message, tags, callback);
};

/**
 * Checks if stats is an array and sends all stats calling back once all have sent
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param type The type of the metric
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.sendAll = function(stat, value, type, sampleRate, tags, callback){
  var completed = 0,
      calledback = false,
      sentBytes = 0,
      self = this;

  if(sampleRate && typeof sampleRate !== 'number'){
    callback = tags;
    tags = sampleRate;
    sampleRate = undefined;
  }

  if(tags && !Array.isArray(tags)){
    callback = tags;
    tags = undefined;
  }

  /**
   * Gets called once for each callback, when all callbacks return we will
   * call back from the function
   * @private
   */
  function onSend(error, bytes){
    completed += 1;
    if(calledback){
      return;
    }

    if(error){
      if (typeof callback === 'function') {
        calledback = true;
        callback(error);
      }
      else if (self.errorHandler) {
        calledback = true;
        self.errorHandler(error);
      }
      return;
    }

    sentBytes += bytes;
    if(completed === stat.length && typeof callback === 'function'){
      callback(null, sentBytes);
    }
  }

  if(Array.isArray(stat)){
    stat.forEach(function(item){
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
  if(sampleRate && sampleRate < 1){
    if(Math.random() < sampleRate){
      message += '|@' + sampleRate;
    } else {
      //don't want to send if we don't meet the sample ratio
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
  if(tags && Array.isArray(tags)){
    mergedTags = overrideTags(mergedTags, tags);
  }
  if(mergedTags.length > 0){
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
    }
    else if (this.errorHandler) {
      return this.errorHandler(this.dnsError);
    }
    throw this.dnsError;
  }

  // Only send this stat if we're not a mock Client.
  if(!this.mock) {
    if(this.maxBufferSize === 0) {
      this.sendMessage(message, callback);
    }
    else {
      this.enqueue(message, callback);
    }
  }
  else {
    if(typeof callback === 'function'){
      callback(null, 0);
    }
  }
};

/**
 * Add the message to the buffer and flush the buffer if needed
 *
 * @param message {String} The constructed message without tags
 */
Client.prototype.enqueue = function(message, callback){
  message += "\n";

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
Client.prototype.flushQueue = function(callback){
  this.sendMessage(this.bufferHolder.buffer, callback);
  this.bufferHolder.buffer = "";
};

/**
 * Send on the message through the socket
 *
 * @param message {String} The constructed message without tags
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.sendMessage = function(message, callback){
  // Guard against "RangeError: Offset into buffer too large" in node 0.10
  // https://github.com/nodejs/node-v0.x-archive/issues/7884
  if (message === "") {
    if (callback) {
      callback(null);
    }
    return;
  }
  var buf = new Buffer(message);
  try {
    this.socket.send(buf, 0, buf.length, this.port, this.host, callback);
  }
  catch(err) {
    var errMessage = 'Error sending hot-shots message: ' + err;
    if (callback) {
      callback(new Error(errMessage));
    }
    else if (this.errorHandler) {
      this.errorHandler(new Error(errMessage));
    }
    else {
      console.log(errMessage);
    }
  }
};

/**
 * Called every bufferFlushInterval to flush any buffer that is around
 */
Client.prototype.onBufferFlushInterval = function() {
  this.flushQueue();
};

/**
 * Close the underlying socket and stop listening for data on it.
 */
Client.prototype.close = function(callback){
  if(this.intervalHandle) {
    clearInterval(this.intervalHandle);
  }

  this.flushQueue();

  if (callback) {
    // use the close event rather than adding a callback to close()
    // because that API is not available in older Node versions
    this.socket.on('close', callback);
  }

  try {
    this.socket.close();
  }
  catch (err) {
    var errMessage = 'Error closing hot-shots socket: ' + err;
    if (callback) {
      callback(new Error(errMessage));
    }
    else if (this.errorHandler) {
      this.errorHandler(new Error(errMessage));
    }
    else {
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
    globalize   : false, // Only "root" client can be global
    mock        : parent.mock,
    // Append child's tags to parent's tags
    globalTags  : Array.isArray(options.globalTags) ?
        overrideTags(parent.globalTags, options.globalTags) : parent.globalTags,
    maxBufferSize : parent.maxBufferSize,
    bufferFlushInterval: parent.bufferFlushInterval,
    telegraf    : parent.telegraf
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
Client.prototype.childClient = function(options) {
  return new ChildClient(this, options);
};

/**
 * Overrides tags in parent with tags from child with the same name (case sensitive) and return the result as new
 * array. parent and child are not mutated.
 */
function overrideTags (parent, child) {
  var childCopy = {};
  var toAppend = [];
  child.forEach(function (tag) {
    var idx = typeof tag === 'string' ? tag.indexOf(':') : -1;
    if (idx < 1) { // Not found or first character
      toAppend.push(tag);
    } else {
      childCopy[tag.substring(0, idx)] = tag.substring(idx + 1);
    }
  });
  var result = parent.map(function (tag) {
    var idx = typeof tag === 'string' ? tag.indexOf(':') : -1;
    if (idx < 1) { // Not found or first character
      return tag;
    }
    var key = tag.substring(0, idx);
    if (childCopy.hasOwnProperty(key)) {
      var value = childCopy[key];
      delete childCopy[key];
      return key + ':' + value;
    }
    return tag;
  });
  Object.keys(childCopy).forEach(function (key) {
    result.push(key + ':' + childCopy[key]);
  });
  return result.concat(toAppend);
}

// Formats a date for use with DataDog
function formatDate(date) {
  var timestamp;
  if (date instanceof Date) {
    // Datadog expects seconds.
    timestamp = Math.round(date.getTime() / 1000);
  } else if (date instanceof Number) {
    // Make sure it is an integer, not a float.
    timestamp = Math.round(date);
  }
  return timestamp;
}

exports = module.exports = Client;
exports.StatsD = Client;
