// errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error(err.stack); // Log error stack to console

  // Default error status and message
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errorDetails = null;

  // Handle specific error types
  if (err.name === "ValidationError") {
    // Mongoose validation error
    statusCode = 400;
    message = "Validation Error";
    errorDetails = err.errors
      ? Object.values(err.errors).map((e) => e.message)
      : [];
  } else if (err.name === "CastError") {
    // Mongoose cast error (invalid ID format)
    statusCode = 400;
    message = "Invalid ID format";
  } else if (err.code === 11000) {
    // MongoDB duplicate key error
    statusCode = 409;
    message = "Duplicate field value entered";
    errorDetails = err.keyValue
      ? `Duplicate value for: ${Object.keys(err.keyValue)}`
      : null;
  } else if (err.name === "JsonWebTokenError") {
    // JWT error
    statusCode = 401;
    message = "Invalid token";
  } else if (err.name === "TokenExpiredError") {
    // JWT expired
    statusCode = 401;
    message = "Token expired";
  }

  // Determine if we should send error details (only in development)
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && {
      error: err.message,
      stack: err.stack,
      details: errorDetails,
    }),
  };

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
