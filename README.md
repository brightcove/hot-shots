# node-statsd

A node.js client for [Etsy](http://etsy.com)'s [StatsD](https://github.com/etsy/statsd) server.

This client will let you fire stats at your StatsD server from a node.js application.

    % npm install node-statsd
    % node
    > require('statsd').StatsD
    > c = new StatsD('example.org',8125)
    { host: 'example.org', port: 8125 }
    > c.increment('node_test.int')
    > c.decrement('node_test.int')
    > c.timing('node_test.some_service.task.time', 500) // time in millis

# License

node-statsd is licensed under the MIT license.

