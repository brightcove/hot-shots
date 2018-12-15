const statsD = require('../lib/statsd');
let count = 0;
const options = {
    maxBufferSize: process.argv[2]
};
const statsd = new statsD(options);

let start = new Date();

function sendPacket() {
    count++;
    statsd.increment('abc.cde.efg.ghk.klm', 1);
    if(count %100000 ===  0) {
        const stop = new Date();
        console.log(stop - start);
        start = stop;
    }
    setImmediate(sendPacket);
}

sendPacket();
