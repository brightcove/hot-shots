var statsD = require('../lib/statsd');
var count = 0;
var options = {
    maxBufferSize: process.argv[2]
};
var statsd = new statsD(options);

var start = new Date();

function sendPacket() {
    count++;
    statsd.increment('abc.cde.efg.ghk.klm', 1);
    if(count %100000 ===  0) {
        var stop = new Date();
        console.log(stop - start);
        start = stop;
    }
    setImmediate(sendPacket);
}

sendPacket();
