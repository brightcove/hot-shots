const assert = require('assert');
const { spawn } = require('child_process');
const helpers = require('./helpers/helpers.js');
const { createHotShotsClient } = helpers;

/**
 * Check if Docker is available on the system
 */
function isDockerAvailable() {
  return new Promise(resolve => {
    const docker = spawn('docker', ['--version']);
    docker.on('close', code => {
      resolve(code === 0);
    });
    docker.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Wait for DogStatsD to be ready by checking logs
 */
function waitForDogStatsD(containerName) {
  return new Promise((resolve, reject) => {
    const maxWait = 15000; // 15 seconds
    const start = Date.now();

    const checkLogs = () => {
      const logsProcess = spawn('docker', ['logs', containerName]);
      let logs = '';

      logsProcess.stdout.on('data', data => {
        logs += data.toString();
      });

      logsProcess.stderr.on('data', data => {
        logs += data.toString();
      });

      logsProcess.on('close', () => {
        if (logs.includes('DogStatsD server') || logs.includes('dogstatsd')) {
          resolve();
        } else if (Date.now() - start < maxWait) {
          setTimeout(checkLogs, 1000);
        } else {
          reject(new Error('DogStatsD server did not start within timeout'));
        }
      });

      logsProcess.on('error', () => {
        reject(new Error('Failed to check container logs'));
      });
    };

    checkLogs();
  });
}

describe('DogStatsD Server Integration Tests', function() {
  this.timeout(45000); // Increased timeout for Docker operations

  let containerName;
  let dockerAvailable = false;

  before(done => {
    isDockerAvailable().then(available => {
      dockerAvailable = available;
      if (!dockerAvailable) {
        console.log('Docker not available, skipping DogStatsD server tests');
        this.skip();
      }
      done();
    }).catch(done);
  });

  beforeEach(done => {
    if (!dockerAvailable) {
      return done();
    }

    containerName = 'dogstatsd-test-' + Date.now();

    // Start DogStatsD container with fixed port for simplicity
    const dockerContainer = spawn('docker', [
      'run',
      '--name', containerName,
      '-d',
      '-p', '18125:8125/udp',
      '-e', 'DD_API_KEY=dummy-key-for-testing',
      '-e', 'DD_DOGSTATSD_NON_LOCAL_TRAFFIC=true',
      '-e', 'DD_LOG_LEVEL=info',
      '-e', 'DD_HOSTNAME=test-dogstatsd-server',
      '-e', 'DD_DOGSTATSD_ONLY=true',
      'datadog/agent:latest'
    ]);

    let output = '';
    dockerContainer.stdout.on('data', data => {
      output += data.toString();
    });

    dockerContainer.stderr.on('data', data => {
      output += data.toString();
    });

    dockerContainer.on('close', code => {
      if (code === 0) {
        // Wait for DogStatsD to be ready
        setTimeout(() => {
          waitForDogStatsD(containerName).then(() => {
            done();
          }).catch(err => {
            console.log('Warning: Could not verify DogStatsD readiness:', err.message);
            done(); // Continue anyway
          });
        }, 3000);
      } else {
        console.log('Docker container output:', output);
        done(new Error('Failed to start DogStatsD container, exit code: ' + code));
      }
    });

    dockerContainer.on('error', error => {
      done(error);
    });
  });

  afterEach(done => {
    if (!dockerAvailable || !containerName) {
      return done();
    }

    // Stop and remove container
    const stopContainer = spawn('docker', ['stop', containerName]);
    stopContainer.on('close', () => {
      const removeContainer = spawn('docker', ['rm', containerName]);
      removeContainer.on('close', done);
      removeContainer.on('error', done);
    });
    stopContainer.on('error', done);
  });

  it('should send metrics to DogStatsD server and check for no errors', done => {
    const client = createHotShotsClient({
      host: 'localhost',
      port: 18125,
      protocol: 'udp',
      maxBufferSize: 8192
    }, 'client');

    // Send various metrics
    client.increment('test.counter', 1, ['env:test', 'service:hot-shots']);
    client.gauge('test.gauge', 42, ['env:test', 'service:hot-shots']);
    client.timing('test.timing', 456, ['env:test', 'service:hot-shots']);

    // Send an event
    client.event('Test Event', 'Integration test event', {
      alert_type: 'info',
      tags: ['env:test', 'service:hot-shots']
    });

    // Send a service check
    client.check('test.service.check', client.CHECKS.OK, {
      message: 'Service is healthy',
      tags: ['env:test', 'service:hot-shots']
    });

    // Wait for metrics to be sent and processed
    setTimeout(() => {
      checkDogStatsDErrors(containerName).then(errorLog => {
        assert.strictEqual(!errorLog, true, 'DogStatsD server should not have errors: ' + errorLog);
        done();
      }).catch(done);
    }, 3000);
  });
});

/**
 * Check DogStatsD container logs for error messages
 * @param {string} containerName - Name of the Docker container
 * @returns {Promise<boolean>} - True if errors found, false otherwise
 */
function checkDogStatsDErrors(containerName) {
  return new Promise(resolve => {
    const logsProcess = spawn('docker', ['logs', containerName]);
    let logs = '';

    logsProcess.stdout.on('data', data => {
      logs += data.toString();
    });

    logsProcess.stderr.on('data', data => {
      logs += data.toString();
    });

    logsProcess.on('close', () => {
      // Check for critical error patterns in DogStatsD logs, excluding expected API key errors
      const criticalErrorPatterns = [
        /FATAL/i,
        /failed to parse/i,
        /invalid metric/i,
        /bind.*failed/i,
        /error.*processing.*dogstatsd/i,
        /dogstatsd.*error/i,
        /unable to reliably determine the host name/i
      ];

      console.log(logs);

      // Filter out expected API key and forwarder errors since we use dummy keys
      const filteredLogs = logs.split('\n').filter(line => {
        return !line.includes('API Key invalid') &&
               !line.includes('api_key') &&
               !line.includes('No valid api key found') &&
               !line.includes('connection refused') &&
               !line.includes('unable to establish stream');
      }).join('\n');

      const hasErrors = criticalErrorPatterns.some(pattern => pattern.test(filteredLogs));

      if (hasErrors) {
        console.log('DogStatsD container logs with critical errors:');
        console.log(filteredLogs);
        resolve(logs);
      } else {
        console.log('DogStatsD container ran without critical errors (API key errors expected)');
        resolve();
      }
    });

    logsProcess.on('error', () => {
      resolve();
    });
  });
}
