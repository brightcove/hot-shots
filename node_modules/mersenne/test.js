
mt = require('./lib/mersenne.js');

function test_gen(f, iter)
    {
    var a = new Array();
    var n = Math.floor(iter / 1000);
    if (n * 1000 != iter)
        {
        throw new Error("Iteration count " + iter + " must be divisible by 1000");
        }
    for (var i = 0; i < n; i += 1)
        {
        a[i] = 0;
        }
    for (var i = 0; i < iter; i += 1)
        {
        q = Math.floor(f(n));
        if (isNaN(q))
            {
            throw new Error("NaN: " + q + " for iter " + i);
            }
        a[q % n] += 1;
        }
    var err = null;
    for (var i = 0; i < n; i += 1)
        {
        if (a[i] < 900 || a[i] > 1100)
            {
            err = new Error("Index " + i + " out of " + n + " is outside [900,1100]: " + a[i]);
            }
        }
    if (err)
        {
        throw new Error(err);
        }
    }

mt.seed(1);
var v = mt.rand();
if (isNaN(v))
    {
    throw new Error('NaN from mt.rand(): ' + v);
    }

var g = new mt.MersenneTwister19937();
g.init_genrand(12345);
var f = function(range)
    {
    var ret = g.genrand_real1() * range;
    return ret;
    }
test_gen(f, 100000);

mt.seed(4711);
f = function(range)
    {
    return mt.rand(range);
    }
test_gen(f, 100000);

mt.seed_array([15, 9932, 11147]);
test_gen(f, 100000);

process.exit(0);
