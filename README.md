# node-statsd

A node.js client for [Etsy](http://etsy.com)'s [StatsD](https://github.com/etsy/statsd) server.

This client will let you fire stats at your StatsD server from a node.js application.

node-statsd Runs and is tested on Node 0.6+ on all *nix platforms and 0.8+ on all platforms including Windows.

[![Build Status](https://secure.travis-ci.org/sivy/node-statsd.png?branch=master)](http://travis-ci.org/sivy/node-statsd)

## Installation

```
$ npm install node-statsd
```

## Usage

All initialization parameters are optional.

Parameters (specified as an options hash):
* `host`:      The host to send stats to `default: localhost`
* `port`:      The port to send stats to `default: 8125`
* `prefix`:    What to prefix each stat name with `default: ''`
* `suffix`:    What to suffix each stat name with `default: ''`
* `globalize`: Expose this StatsD instance globally? `default: false`
* `dnsCache`:  Cache the initial dns lookup to *host* `default: false`
* `mock`:      Create a mock StatsD instance, sending no stats to the server? `default: false`

All StatsD methods have the same API:
* `name`:       Stat name `required`
* `value`:      Stat value `required except in increment/decrement where it defaults to 1/-1 respectively`
* `sampleRate`: Sends only a sample of data to StatsD `default: 1`
* `callback`:   The callback to execute once the metric has been sent

If an array is specified as the `name` parameter each item in that array will be sent along with the specified value.

```javascript
  var StatsD = require('node-statsd').StatsD,
      client = new StatsD();

  // Timing: sends a timing command with the specified milliseconds
  client.timing('response_time', 42);

  // Increment: Increments a stat by a value (default is 1)
  client.increment('my_counter');

  // Decrement: Decrements a stat by a value (default is -1)
  client.decrement('my_counter');

  // Gauge: Gauge a stat by a specified amount
  client.gauge('my_gauge', 123.45);

  // Set: Counts unique occurrences of a stat (alias of unique)
  client.set('my_unique', 'foobar');
  client.unique('my_unique', 'foobarbaz');

  // Incrementing multiple items
  client.increment(['these', 'are', 'different', 'stats']);

  // Sampling, this will sample 25% of the time the StatsD Daemon will compensate for sampling
  client.increment('my_counter', 1, 0.25);

  // Using the callback
  client.set(['foo', 'bar'], 42, null, function(error, bytes){
    //this only gets called once after all messages have been sent
    if(error){
      console.error('Oh noes! There was an error:', error);
    } else {
      console.log('Successfully sent', bytes, 'bytes');
    }
  });
```

## Errors

In the event that there is a socket error, `node-statsd` will allow this error to bubble up.  If you would like to catch the errors, just attach a listener to the socket property on the instance.

```javascript
client.socket.on('error', function(error) {
  return console.error("Error in socket: ", error);
});
```

If you want to catch errors in sending a message then use the callback provided.

## License

node-statsd is licensed under the MIT license.

