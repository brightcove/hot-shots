CHANGELOG
=========

## 4.7.0 (2017-9-21)
* @bdeitte Revert TypeScript typings, which ended up not being semver minor

## 4.6.0 (2017-9-19)
* @jgwmaxwell TypeScript typings

## 4.5.0 (2017-5-4)
* @jsocol Support default value with tags in increment

## 4.4.0 (2017-3-23)
* @RijulB Global sample rate

## 4.3.1 (2016-11-7)
* @RandomSeeded Fix callbacks not being triggered when using buffers

## 4.3.0 (2016-9-30)
* @ggoodman Allow socket errors to be handled with errorHandler

## 4.2.0 (2016-8-3)
* @mhahn Add support for DataDog service checks

## 4.1.1 (2016-5-22)
* @ash2k date_happened should be seconds, not milliseconds

## 4.1.0 (2016-5-8)
* @ash2k Support multiline text in DataDog events

## 4.0.0 (2016-5-7)
* @ash2k Provided tags, including `childClient()` tags, override global tags with same names.

## 3.1.0 (2016-5-3)
* @ash2k Support a client-wide error handler used in case no callback is provided and to handle various exceptions.

## 3.0.1 (2016-4-28)
* @bdeitte Add 'use strict' to files and make changes needed for this.

## 3.0.0 (2016-4-27)
* @ash2k Method to create child clients.  (This is not a backwards-incompatible change but is rather large.)
* @ash2k Shrink npm package a bit more

## 2.4.0 (2016-2-26)
* @arlolra Shrink npm package
* @arlolra/@bdeitte Move DNS errors when caching them to send() and use callback when possible
* @bdeitte Use callback for Telegraf error when possible

## 2.3.1 (2016-2-3)
* @Pchelolo Ensure messages not larger then maxBufferSize

## 2.3.0 (2016-1-17)
* @bdeitte Fix increment(name, 0) to send a 0 count instead of 1
* @bdeitte Flush the queue when needed on close()

## 2.2.0 (2016-1-10)
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
* @jjofseattle Add options.maxBufferSize and options.bufferFlushInterval
* @bdeitte Change options.global_tags to options.globalTags for consistency

## 1.0.2 (2015-09-25)
* @ainsleyc Thrown error when cacheDNS flag fails to resolve DNS name

## 1.0.1 (2015-09-24)
* @bdeitte Add the event API used by DogStatsD
* @sivy Start from the base of https://github.com/sivy/node-statsd
