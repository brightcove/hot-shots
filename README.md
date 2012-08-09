# node-statsd

A node.js client for [Etsy](http://etsy.com)'s [StatsD](https://github.com/etsy/statsd) server.

This client will let you fire stats at your StatsD server from a node.js application.

    % npm install node-statsd
    % node
    > var StatsD = require('node-statsd').StatsD
    > c = new StatsD('example.org',8125)
    { host: 'example.org', port: 8125 }
    > c.increment('node_test.int')
    > c.decrement('node_test.int')
    > c.timing('node_test.some_service.task.time', 500) // time in millis

# License

node-statsd is licensed under the MIT license.

# Error handling policy

* exceptions "bubble up" into the app that uses this library
* we don't log or print to console any errors ourself, it's the toplevel app that decides how to log/write to console.
* we document which exceptions can be raised, and where. (TODO, https://github.com/sivy/node-statsd/issues/17)

in your main app, you can leverage the fact that you have access to c.socket and do something like:
(this is the best way I've found so far)

    c.socket.on('error', function (exception) {
       return console.log ("error event in socket.send(): " + exception);
    });
