/**
 * The UDP Client for StatsD
 * @param host The host to connect to default: localhost
 * @param port The port to connect to default: 8125
 * @param prefix An optional prefix to assign to each stat name sent
 * @param suffix An optional suffix to assign to each stat name sent
 * @param globalize An optional boolean to add "statsd" as an object in the global namespace
 * @constructor
 */
var Client = function (host, port, prefix, suffix, globalize) {
  this.host = host || 'localhost';
  this.port = port || 8125;
  this.prefix = prefix || '';
  this.suffix = suffix || '';
  this.socket = require('dgram').createSocket('udp4');

  if(globalize){
    global.statsd = this;
  }
};

/**
 * Represents the timing stat
 * @param stat {String} The stat to send
 * @param time {Number} The time in milliseconds to send
 * @param sampleRate {Number} The Number of times to sample (0 to 1)
 * @param callback {Function} Callback when message is done being delivered. Optional.
 */
Client.prototype.timing = function (stat, time, sampleRate, callback) {
  this.send(stat, time, 'ms', sampleRate, callback);
};

/**
 * Increments a stat by a specified amount
 * @param stat {String} The stat to send
 * @param value The value to send
 * @param sampleRate {Number} The Number of times to sample (0 to 1)
 * @param callback {Function} Callback when message is done being delivered. Optional.
 */
Client.prototype.increment = function (stat, value, sampleRate, callback) {
  this.send(stat, value || 1, 'c', sampleRate, callback);
};

/**
 * Decrements a stat by a specified amount
 * @param stat {String} The stat to send
 * @param value The value to send
 * @param sampleRate {Number} The Number of times to sample (0 to 1)
 * @param callback {Function} Callback when message is done being delivered. Optional.
 */
Client.prototype.decrement = function (stat, value, sampleRate, callback) {
  this.send(stat, -value || -1, 'c', sampleRate, callback);
};

/**
 * Gauges a stat by a specified amount
 * @param stat {String} The stat to send
 * @param value The value to send
 * @param sampleRate {Number} The Number of times to sample (0 to 1)
 * @param callback {Function} Callback when message is done being delivered. Optional.
 */
Client.prototype.gauge = function (stat, value, sampleRate, callback) {
  this.send(stat, value, 'g', sampleRate, callback);
};

/**
 * Counts unique values by a specified amount
 * @param stat {String} The stat to send
 * @param value The value to send
 * @param sampleRate {Number} The Number of times to sample (0 to 1)
 * @param callback {Function} Callback when message is done being delivered. Optional.
 */
Client.prototype.unique =
Client.prototype.set = function (stat, value, sampleRate, callback) {
  this.send(stat, value, 's', sampleRate, callback);
};

/**
 * Sends a stat across the wire
 * @param stat {String} The stat to send
 * @param value The value to send
 * @param type {String} The type of message to send to statsd
 * @param sampleRate {Number} The Number of times to sample (0 to 1)
 * @param callback {Function} Callback when message is done being delivered. Optional.
 */
Client.prototype.send = function (stat, value, type, sampleRate, callback) {
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

  buf = new Buffer(message);
  this.socket.send(buf, 0, buf.length, this.port, this.host, callback);
};


exports.StatsD = Client;
