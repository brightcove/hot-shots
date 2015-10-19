var statsD = require('node-statsd');
var count = 0;
var options = {
    maxBufferSize: 0
};
var statsd = new statsD(options);

var start = new Date();

function sendPacket() {
    count++;
    statsd.increment('abc.cde.efg.ghk.klm', 1);
    //process.nextTick(sendPacket);
    if(count %1000000 ===  0) {
        var stop = new Date();
        console.log(stop - start);
        start = stop;
    }
    setImmediate(sendPacket);
}

function counting() {
    console.log(count);
    count = 0;
    setInterval(counting, 10000);
}

sendPacket();
