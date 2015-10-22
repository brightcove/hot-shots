var dgram = require('dgram'),
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
 *   @option global_tags {Array=} Optional tags that will be added to every metric
 *   @maxBufferSize      {Number} An optional value for aggregating metrics to send, mainly for performance improvement
 *   @bufferFlushInterval {Number} the time out value to flush out buffer if not
 * @constructor
 */
var Client = function (host, port, prefix, suffix, globalize, cacheDns, mock, global_tags, maxBufferSize, bufferFlushInterval) {
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
      global_tags : global_tags,
      maxBufferSize : maxBufferSize,
      bufferFlushInterval: bufferFlushInterval
    };
  }

  this.host        = options.host || 'localhost';
  this.port        = options.port || 8125;
  this.prefix      = options.prefix || '';
  this.suffix      = options.suffix || '';
  this.socket      = dgram.createSocket('udp4');
  this.mock        = options.mock;
  this.global_tags = options.global_tags || [];
  this.maxBufferSize = options.maxBufferSize || 0;
  this.bufferFlushInterval = options.bufferFlushInterval || 1000;
  this.buffer = "";

  if(this.maxBufferSize > 0) {
    this.intervalHandle = setInterval(this.timeoutCallback.bind(this), this.bufferFlushInterval);
  }

  if(options.cacheDns === true){
    dns.lookup(options.host, function(err, address, family){
      if(err === null){
        self.host = address;
      } else {
        throw new Error(err);
      }
    });
  }

  if(options.globalize){
    global.statsd = this;
  }
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
  this.sendAll(stat, value || 1, 'c', sampleRate, tags, callback);
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
  var message,
      msgTitle = title ? title : '',
      msgText = text ? text : title;

  // start out the message with the event-specific title and text info
  message = '_e{' + msgTitle.length + ',' + msgText.length + '}:' + msgTitle + '|' + msgText;

  // add in the event-specific options
  if (options) {
    if (options.date_happened && options.date_happened instanceof Date) {
      message += '|d:' + options.date_happened.getTime();
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
    if(calledback || typeof callback !== 'function'){
      return;
    }

    if(error){
      calledback = true;
      return callback(error);
    }

    sentBytes += bytes;
    if(completed === stat.length){
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
  var message = this.prefix + stat + this.suffix + ':' + value + '|' + type,
    buf;

  if(sampleRate && sampleRate < 1){
    if(Math.random() < sampleRate){
      message += '|@' + sampleRate;
    } else {
      //don't want to send if we don't meet the sample ratio
      return;
    }
  }
  this.send(message, tags, callback);
};

/**
 * Send a stat or event across the wire
 * @param message {String} The constructed message without tags
 * @param tags {Array} The tags to include (along with global tags). Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.send = function (message, tags, callback) {
  var buf,
      merged_tags = [];

  if(tags && Array.isArray(tags)){
    merged_tags = merged_tags.concat(tags);
  }
  if(this.global_tags && Array.isArray(this.global_tags)){
    merged_tags = merged_tags.concat(this.global_tags);
  }
  if(merged_tags.length > 0){
    message += '|#' + merged_tags.join(',');
  }

  // Only send this stat if we're not a mock Client.
  if(!this.mock) {
      if(this.maxBufferSize === 0) {
          this.sendMessage(message, callback);
      }
      else {
          this.enqueue(message);
      }
  }
  else {
    if(typeof callback === 'function'){
      callback(null, 0);
    }
  }
};

/**
 *
 * @param message {String}
 */
Client.prototype.enqueue = function(message){
  this.buffer += message + "\n";
  if(this.buffer.length >= this.maxBufferSize) {
      this.flushQueue();
  }
}

/**
 *
 */
Client.prototype.flushQueue = function(){
  this.sendMessage(this.buffer);
  this.buffer = "";
}

/**
 *
 * @param message {String}
 * @param callback {Function}
 */
Client.prototype.sendMessage = function(message, callback){
  var buf = new Buffer(message);
  this.socket.send(buf, 0, buf.length, this.port, this.host, callback);
}

/**
 *
 */
Client.prototype.timeoutCallback = function(){
  if(this.buffer !== "") {
    this.flushQueue();
  }
}

/**
 * Close the underlying socket and stop listening for data on it.
 */
Client.prototype.close = function(){
  if(this.intervalHandle) {
    clearInterval(this.intervalHandle);
  }
  this.socket.close();
};

exports = module.exports = Client;
exports.StatsD = Client;

