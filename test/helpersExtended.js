const assert = require('assert');
const fs = require('fs');
const helpers = require('../lib/helpers');

describe('#helpersExtended', () => {
  describe('#formatDate', () => {
    it('should format Date object to seconds timestamp', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      const result = helpers.formatDate(date);
      assert.strictEqual(result, 1672531200);
    });

    it('should format Date object with milliseconds to rounded seconds', () => {
      const date = new Date('2023-01-01T00:00:00.750Z');
      const result = helpers.formatDate(date);
      assert.strictEqual(result, 1672531201); // Should round up
    });

    it('should format number timestamp to integer', () => {
      const timestamp = 1672531200.5;
      const result = helpers.formatDate(timestamp);
      assert.strictEqual(result, 1672531201); // Should round up
    });

    it('should format Number object to integer', () => {
      const timestamp = new Number(1672531200.7);
      const result = helpers.formatDate(timestamp);
      assert.strictEqual(result, 1672531201); // Should round up
    });

    it('should return undefined for invalid input', () => {
      const result = helpers.formatDate('invalid');
      assert.strictEqual(result, undefined);
    });

    it('should return undefined for null input', () => {
      const result = helpers.formatDate(null);
      assert.strictEqual(result, undefined);
    });

    it('should return undefined for undefined input', () => {
      const result = helpers.formatDate(undefined);
      assert.strictEqual(result, undefined);
    });
  });

  describe('#intToIP', () => {
    it('should convert integer to IP address', () => {
      // 192.168.1.1 = 0xC0A80101 = 3232235777
      const result = helpers.intToIP(3232235777);
      assert.strictEqual(result, '192.168.1.1');
    });

    it('should convert 0 to 0.0.0.0', () => {
      const result = helpers.intToIP(0);
      assert.strictEqual(result, '0.0.0.0');
    });

    it('should convert localhost IP', () => {
      // 127.0.0.1 = 0x7F000001 = 2130706433
      const result = helpers.intToIP(2130706433);
      assert.strictEqual(result, '127.0.0.1');
    });

    it('should convert max IP address', () => {
      // 255.255.255.255 = 0xFFFFFFFF = 4294967295
      const result = helpers.intToIP(4294967295);
      assert.strictEqual(result, '255.255.255.255');
    });

    it('should handle endianness correctly', () => {
      // Test specific byte ordering
      const result = helpers.intToIP(0x01020304);
      assert.strictEqual(result, '1.2.3.4');
    });
  });

  describe('#getDefaultRoute', () => {
    let originalReadFileSync;
    let originalConsoleError;
    let consoleErrorCalls;

    beforeEach(() => {
      originalReadFileSync = fs.readFileSync;
      originalConsoleError = console.error;
      consoleErrorCalls = [];
      console.error = (...args) => {
        consoleErrorCalls.push(args);
      };
    });

    afterEach(() => {
      fs.readFileSync = originalReadFileSync;
      console.error = originalConsoleError;
    });

    it('should return default route IP when /proc/net/route exists', () => {
      // Mock /proc/net/route content with default route
      const mockRouteContent = `Iface	Destination	Gateway	Flags	RefCnt	Use	Metric	Mask	MTU	Window	IRTT
eth0	00000000	0100A8C0	0003	0	0	0	00000000	0	0	0
eth0	0000A8C0	00000000	0001	0	0	0	0000FFFF	0	0	0`;

      fs.readFileSync = (path, encoding) => {
        if (path === '/proc/net/route' && encoding === 'utf8') {
          return mockRouteContent;
        }
        return originalReadFileSync(path, encoding);
      };

      const result = helpers.getDefaultRoute();
      assert.strictEqual(result, '192.168.0.1'); // 0100A8C0 in little endian
    });

    it('should return null when no default route found', () => {
      // Mock /proc/net/route content without default route
      const mockRouteContent = `Iface	Destination	Gateway	Flags	RefCnt	Use	Metric	Mask	MTU	Window	IRTT
eth0	0000A8C0	00000000	0001	0	0	0	0000FFFF	0	0	0`;

      fs.readFileSync = (path, encoding) => {
        if (path === '/proc/net/route' && encoding === 'utf8') {
          return mockRouteContent;
        }
        return originalReadFileSync(path, encoding);
      };

      const result = helpers.getDefaultRoute();
      assert.strictEqual(result, null);
    });

    it('should return null and log error when file cannot be read', () => {
      fs.readFileSync = (path, encoding) => {
        if (path === '/proc/net/route') {
          throw new Error('Permission denied');
        }
        return originalReadFileSync(path, encoding);
      };

      const result = helpers.getDefaultRoute();
      assert.strictEqual(result, null);
      assert.strictEqual(consoleErrorCalls.length, 1);
      assert.strictEqual(consoleErrorCalls[0][0], 'Could not get default route from /proc/net/route');
    });

    it('should handle empty file', () => {
      fs.readFileSync = (path, encoding) => {
        if (path === '/proc/net/route' && encoding === 'utf8') {
          return '';
        }
        return originalReadFileSync(path, encoding);
      };

      const result = helpers.getDefaultRoute();
      assert.strictEqual(result, null);
    });

    it('should handle malformed route file', () => {
      fs.readFileSync = (path, encoding) => {
        if (path === '/proc/net/route' && encoding === 'utf8') {
          return 'malformed content';
        }
        return originalReadFileSync(path, encoding);
      };

      const result = helpers.getDefaultRoute();
      assert.strictEqual(result, null);
    });
  });

  describe('#sanitizeTags', () => {
    it('should sanitize tags for StatsD (default)', () => {
      const result = helpers.sanitizeTags('tag:with|special@chars,here');
      assert.strictEqual(result, 'tag_with_special_chars_here');
    });

    it('should sanitize tags for Telegraf', () => {
      const result = helpers.sanitizeTags('tag:with|special,chars', true);
      assert.strictEqual(result, 'tag_with_special_chars');
    });

    it('should handle non-string values', () => {
      const result = helpers.sanitizeTags(123);
      assert.strictEqual(result, '123');
    });

    it('should handle null values', () => {
      const result = helpers.sanitizeTags(null);
      assert.strictEqual(result, 'null');
    });

    it('should handle undefined values', () => {
      const result = helpers.sanitizeTags(undefined);
      assert.strictEqual(result, 'undefined');
    });
  });

  describe('#overrideTags edge cases', () => {
    it('should return false when child is null', () => {
      const parent = ['parent:tag'];
      const result = helpers.overrideTags(parent, null);
      assert.strictEqual(result, false);
    });

    it('should return false when child is undefined', () => {
      const parent = ['parent:tag'];
      const result = helpers.overrideTags(parent, undefined);
      assert.strictEqual(result, false);
    });

    it('should handle tags without colons', () => {
      const parent = ['env:prod', 'standalone'];
      const child = ['env:dev', 'another'];
      const result = helpers.overrideTags(parent, child);

      assert(result.includes('standalone'));
      assert(result.includes('another'));
      assert(result.includes('env:dev'));
      // env:prod should be removed because child overrides the 'env' key
      assert(!result.includes('env:prod'));
    });

    it('should handle object tags with multiple values for same key', () => {
      const parent = ['env:prod', 'version:1.0'];
      const child = { env: 'staging' };
      const result = helpers.overrideTags(parent, child);

      // Object tags get formatted as key:value
      assert(result.includes('env:staging'));
      assert(result.includes('version:1.0'));
      assert(!result.includes('env:prod'));
    });

    it('should handle empty parent array', () => {
      const parent = [];
      const child = ['child:tag'];
      const result = helpers.overrideTags(parent, child);

      assert.strictEqual(result.length, 1);
      assert(result.includes('child:tag'));
    });

    it('should handle tags with colon as first character', () => {
      const parent = ['normal:tag'];
      const child = [':invalid', 'valid:tag'];
      const result = helpers.overrideTags(parent, child);

      assert(result.includes(':invalid'));
      assert(result.includes('valid:tag'));
      // normal:tag should remain because child doesn't override 'normal' key
      assert(result.includes('normal:tag'));
    });
  });
});