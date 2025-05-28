/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string|Error} [errorMessage='Operation timed out'] - Custom error message or Error instance
 * @returns {Promise} Promise that rejects if it doesn't resolve before timeout
 */
function timeout(promise, ms, errorMessage = "Operation timed out") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        typeof errorMessage === "string"
          ? new Error(errorMessage)
          : errorMessage
      );
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// Custom error class for timeouts
class TimeoutError extends Error {
  constructor(message = "Request timeout") {
    super(message);
    this.name = "TimeoutError";
    this.code = "ETIMEDOUT";
  }
}

module.exports = timeout;
module.exports.TimeoutError = TimeoutError;
