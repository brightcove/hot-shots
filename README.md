# hot-shots

A Node.js client for [Etsy](http://etsy.com)'s [StatsD](https://github.com/etsy/statsd) server, Datadog's [DogStatsD](http://docs.datadoghq.com/guides/dogstatsd/) server, and [InfluxDB's](http://influxdb.com) [Telegraf](https://github.com/influxdb/telegraf) StatsD server.

This project is a fork off of [node-statsd](https://github.com/sivy/node-statsd).  This project includes all changes in node-statsd, all open PRs to node-statsd when possible, and some additional goodies (like Telegraf support, child clients, TypeScript types, and more).

[![Build Status](https://secure.travis-ci.org/brightcove/hot-shots.png?branch=master)](http://travis-ci.org/brightcove/hot-shots)

## Installation

```
$ npm install hot-shots
```

## Migrating from node-statsd

You generally just need to do two things:

1. Change node-statsd to hot-shots in all requires
2. Change global_stats to globalStats as a parameter name

You may also want to use the Datadog events support in here instead of other libraries.  You can also check the detailed [change log](https://github.com/brightcove/hot-shots/blob/master/CHANGES.md) for what has changed since the last release of node-statsd.

## Usage

All initialization parameters are optional.

Parameters (specified as an options hash):
* `host`:        The host to send stats to `default: localhost`
* `port`:        The port to send stats to `default: 8125`
* `prefix`:      What to prefix each stat name with `default: ''`
* `suffix`:      What to suffix each stat name with `default: ''`
* `globalize`:   Expose this StatsD instance globally? `default: false`
* `cacheDns`:    Cache the initial dns lookup to *host* `default: false`
* `mock`:        Create a mock StatsD instance, sending no stats to the server? `default: false`
* `globalTags`:  Tags that will be added to every metric `default: []`
* `maxBufferSize`: If larger than 0,  metrics will be buffered and only sent when the string length is greater than the size. `default: 0`
* `bufferFlushInterval`: If buffering is in use, this is the time in ms to always flush any buffered metrics. `default: 1000`
* `telegraf`:    Use Telegraf's StatsD line protocol, which is slightly different than the rest `default: false`
* `sampleRate`:    Sends only a sample of data to StatsD for all StatsD methods.  Can be overriden at the method level. `default: 1`
* `errorHandler`: A function with one argument. It is called to handle various errors. `default: none`, errors are thrown/logger to console

All StatsD methods other than event and close have the same API:
* `name`:       Stat name `required`
* `value`:      Stat value `required except in increment/decrement where it defaults to 1/-1 respectively`
* `sampleRate`: Sends only a sample of data to StatsD `default: 1`
* `tags`:       The Array of tags to add to metrics `default: []`
* `callback`:   The callback to execute once the metric has been sent or buffered

If an array is specified as the `name` parameter each item in that array will be sent along with the specified value.

The close method has the following API:

* `callback`:   The callback to execute once close is complete.  All other calls to statsd will fail once this is called.

The event method has the following API:

* `title`:       Event title `required`
* `text`:        Event description `default is title`
* `options`:     Options for the event
  * `date_happened`    Assign a timestamp to the event `default is now`
  * `hostname`         Assign a hostname to the event.
  * `aggregation_key`  Assign an aggregation key to the event, to group it with some others.
  * `priority`         Can be ‘normal’ or ‘low’ `default: normal`
  * `source_type_name` Assign a source type to the event.
  * `alert_type`       Can be ‘error’, ‘warning’, ‘info’ or ‘success’ `default: info`
* `tags`:       The Array of tags to add to metrics `default: []`
* `callback`:   The callback to execute once the metric has been sent.

The check method has the following API:

* `name`:        Check name `required`
* `status`:      Check status `required`
* `options`:     Options for the check
  * `date_happened`    Assign a timestamp to the check `default is now`
  * `hostname`         Assign a hostname to the check.
  * `message`          Assign a message to the check.
* `tags`:       The Array of tags to add to metrics `default: []`
* `callback`:   The callback to execute once the metric has been sent.

```javascript
  var StatsD = require('hot-shots'),
      client = new StatsD();

  // Catch socket errors so they don't go unhandled, as explained
  // in the Errors section below
  client.socket.on('error', function(error) {
    console.error("Error in socket: ", error);
  });

  // Timing: sends a timing command with the specified milliseconds
  client.timing('response_time', 42);

  // Increment: Increments a stat by a value (default is 1)
  client.increment('my_counter');

  // Decrement: Decrements a stat by a value (default is -1)
  client.decrement('my_counter');

  // Histogram: send data for histogram stat (DataDog and Telegraf only)
  client.histogram('my_histogram', 42);

  // Gauge: Gauge a stat by a specified amount
  client.gauge('my_gauge', 123.45);

  // Set: Counts unique occurrences of a stat (alias of unique)
  client.set('my_unique', 'foobar');
  client.unique('my_unique', 'foobarbaz');

  // Event: sends the titled event (DataDog only)
  client.event('my_title', 'description');

  // Check: sends a service check (DataDog only)
  client.check('service.up', client.CHECKS.OK, { hostname: 'host-1' }, ['foo', 'bar'])

  // Incrementing multiple items
  client.increment(['these', 'are', 'different', 'stats']);

  // Sampling, this will sample 25% of the time the StatsD Daemon will compensate for sampling
  client.increment('my_counter', 1, 0.25);

  // Tags, this will add user-defined tags to the data (DataDog and Telegraf only)
  client.histogram('my_histogram', 42, ['foo', 'bar']);

  // Using the callback.  This is the same format for the callback
  // with all non-close calls
  client.set(['foo', 'bar'], 42, function(error, bytes){
    //this only gets called once after all messages have been sent
    if(error){
      console.error('Oh noes! There was an error:', error);
    } else {
      console.log('Successfully sent', bytes, 'bytes');
    }
  });

  // Sampling, tags and callback are optional and could be used in any combination (DataDog and Telegraf only)
  client.histogram('my_histogram', 42, 0.25); // 25% Sample Rate
  client.histogram('my_histogram', 42, ['tag']); // User-defined tag
  client.histogram('my_histogram', 42, next); // Callback
  client.histogram('my_histogram', 42, 0.25, ['tag']);
  client.histogram('my_histogram', 42, 0.25, next);
  client.histogram('my_histogram', 42, ['tag'], next);
  client.histogram('my_histogram', 42, 0.25, ['tag'], next);

  // Use a child client to add more context to the client.
  // Clients can be nested.
  var childClient = client.childClient({
    prefix: 'additionalPrefix.',
    suffix: '.additionalSuffix',
    globalTags: ['globalTag1:forAllMetricsFromChildClient']
  });
  childClient.increment('my_counter_with_more_tags');

  // Close statsd.  This will ensure all stats are sent and stop statsd
  // from doing anything more.
  client.close(function(err) {
    console.log('The close did not work quite right: ', err);
  });
```

## DogStatsD and Telegraf functionality

Some of the functionality mentioned above is specific to DogStatsD or Telegraf.  They will not do anything if you are using the regular statsd client.
* globalTags parameter- DogStatsD or Telegraf
* tags parameter- DogStatsD or Telegraf
* telegraf parameter- Telegraf
* histogram method- DogStatsD or Telegraf
* event method- DogStatsD
* check method- DogStatsD

## Errors

As usual, callbacks will have an error as their first parameter.  You can have an error in both the message and close callbacks.

If the optional callback is not given, an error is thrown in some cases and a console.log message is used in others.  An error will only be thrown when there is a missing callback if it is some potential configuration issue to be fixed.

In the event that there is a socket error, `hot-shots` will allow this error to bubble up unless an `errorHandler` is specified.  If you would like to catch the errors, either specify an `errorHandler` in your root client or just attach a listener to the socket property on the instance.

```javascript
// Using errorHandler
var client = new StatsD({
  errorHandler: function (error) {
    console.log("Socket errors caught here: ", error);
  }
})
```

```javascript
// Attaching an error handler to client's socket
client.socket.on('error', function(error) {
  console.error("Error in socket: ", error);
});
```

## Submitting changes

Thanks for considering making any updates to this project!  Here are the steps to take in your fork:

1. Run "npm install"
2. Add your changes in your fork as well as any new tests needed
3. Run "npm test"
4. Update README.md with any needed documentation
5. Push your changes and create the PR

When you've done all this we're happy to try to get this merged in right away.

## Name

Why is this project named hot-shots?  Because:

1. It's impossible to find another statsd name on npm
2. It's the name of a dumb movie
3. No good reason

## License

hot-shots is licensed under the MIT license.
