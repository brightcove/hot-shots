CHANGELOG
=========

## HEAD (Unreleased)
none

--------------------

## 2.4.0 (2015-2-26)
* @arlolra Shrink npm package
* @arlolra/@bdeitte Move DNS errors when caching them to send() and use callback when possible
* @bdeitte Use callback for Telegraf error when possible

## 2.3.1 (2015-2-3)
* @Pchelolo Ensure messages not larger then maxBufferSize

## 2.3.0 (2015-1-17)
* @bdeitte Fix increment(name, 0) to send a 0 count instead of 1
* @bdeitte Flush the queue when needed on close()

## 2.2.0 (2015-1-10)
* @bdeitte Document and expand on close API
* @bdeitte Catch more error cases for callbacks

## 2.1.2 (2015-12-9)
* @bdeitte Even more doc updates
* @mmoulton Fix multiple tags with Telegraf

## 2.1.1 (2015-12-9)
* @bdeitte Doc updates

## 2.1.0 (2015-12-9)
* @mmoulton Add options.telegraf to enable support for Telegraf's StatsD line protocol format
* @mmoulton Ensure message callback is sent in buffered case, even when we just buffer.

## 2.0.0 (2015-10-22)
* @jjofseattle Add options.maxBufferSize and optinons.bufferFlushInterval
* @bdeitte Change options.global_tags to options.globalTags for conistency

## 1.0.2 (2015-09-25)
* @ainsleyc Thrown error when cacheDNS flag fails to resolve DNS name

## 1.0.1 (2015-09-24)
* @bdeitte Add the event API used by DogStatsD
* @sivy Start from the base of https://github.com/sivy/node-statsd
