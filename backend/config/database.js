// config/database.js - MongoDB connection
const mongoose = require('mongoose');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger').scope('database');

// A cold-start race against Mongo (container/replica set not fully up
// yet) or a momentary network blip on the connection attempt itself was
// previously fatal on the very first try - connectDB would log and
// process.exit(1) immediately. Retrying the initial connection a
// handful of times with backoff first means a transient blip at boot no
// longer takes the whole process down; a genuinely bad MONGO_URI/down
// database still exits exactly as before once retries are exhausted.
const connectWithRetry = () => withRetry(
  () => mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    // Reuses connections across requests instead of opening a new one
    // per query; 10 comfortably covers this app's concurrency at no
    // extra infrastructure cost. Mongoose's own default (100) is far
    // more than a single small-to-mid app instance needs and just holds
    // idle sockets open.
    maxPoolSize: 10,
    // Fail a query fast (rather than hanging the request) if the server
    // can't be reached, so a Mongo outage surfaces as a clear error
    // instead of a slowly-timing-out request.
    serverSelectionTimeoutMS: 10000,
  }),
  { label: 'MongoDB connect', retries: 4, baseDelayMs: 1000, maxDelayMs: 8000 }
);

const connectDB = async () => {
  try {
    const conn = await connectWithRetry();
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
