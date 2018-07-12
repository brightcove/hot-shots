'use strict'

var runBufferTestSuite = require('./buffer');
var runCloseMethodTestSuite = require('./close');
var runGlobalTagsTestSuite = require('./globalTags');
var runInitTestSuite = require('./init');
var runSendAllMethodTestSuite = require('./sendAll');
var runTimerTestSuite = require('./timer');

/**
 * Since sampling uses random, we need to patch Math.random() to always give
 * a consistent result
 */
Math.random = function () {
  return 0.42;
};

beforeEach(function () {
  // Remove it from the namespace to not fail other tests
  delete global.statsd;
});

describe('StatsD', function () {
  runBufferTestSuite();
  runCloseMethodTestSuite();
  runGlobalTagsTestSuite();
  runInitTestSuite();
  runSendAllMethodTestSuite();
  runTimerTestSuite();
});
