// middleware/errorHandler.js
const logger = require('../utils/logger').scope('errorHandler');

const errorHandler = (err, req, res, next) => {
  // Log full detail server-side; only ever surface a safe message to the client.
  logger.error(err.stack);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || 'Field';
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }

  // Mongoose bad ObjectId (e.g. a malformed :id route param) — without this
  // these throw as a generic 500 instead of a clean, expected 400.
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path || 'id'}`;
  }

  // Multer file-upload errors (wrong type, too large, etc.) — surfaced as a
  // clean 400 instead of falling through to a raw 500.
  if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File is too large'
      : (err.message || 'File upload failed');
  }

  // JWT errors — covers both invalid signatures and expired tokens
  // (TokenExpiredError extends JsonWebTokenError but has its own `name`).
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Session expired, please log in again';
  }

  // Never leak internal error detail (stack traces, driver messages) to the
  // client outside development, regardless of what generated the error.
  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
