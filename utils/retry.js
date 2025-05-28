/**
 * Retries a promise-returning function with exponential backoff
 * @param {Function} fn - Function that returns a promise
 * @param {Object} [options] - Retry options
 * @param {number} [options.retries=3] - Number of retry attempts
 * @param {number} [options.minTimeout=1000] - Minimum wait time between retries (ms)
 * @param {number} [options.maxTimeout=30000] - Maximum wait time between retries (ms)
 * @param {Function} [options.shouldRetry] - Function to determine if error should be retried
 * @returns {Promise} Promise that resolves with fn's result or rejects after all retries
 */
function retry(fn, options = {}) {
  const {
    retries = 3,
    minTimeout = 1000,
    maxTimeout = 30000,
    shouldRetry = (error) => true,
  } = options;

  return new Promise((resolve, reject) => {
    const attempt = (attemptNumber) => {
      fn()
        .then(resolve)
        .catch((error) => {
          if (attemptNumber >= retries || !shouldRetry(error)) {
            return reject(error);
          }

          const delay = Math.min(
            maxTimeout,
            minTimeout * Math.pow(2, attemptNumber - 1)
          );

          setTimeout(() => attempt(attemptNumber + 1), delay);
        });
    };

    attempt(1);
  });
}

// Custom error class for retries
class MaxRetriesError extends Error {
  constructor(message = "Maximum retries reached") {
    super(message);
    this.name = "MaxRetriesError";
    this.code = "EMAXRETRIES";
  }
}

module.exports = retry;
module.exports.MaxRetriesError = MaxRetriesError;
