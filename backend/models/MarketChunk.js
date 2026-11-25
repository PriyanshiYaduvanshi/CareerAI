// models/MarketChunk.js
//
// RAG chunk collection backing the Job Market Trends agent
// (aiController.marketTrends / aiService.getMarketTrends). This is the
// one agent in the codebase that was previously 100% ungrounded free
// generation (see aiService.js) — every report it produces is now also
// indexed here, so future calls for the same/related role+location can
// retrieve and ground themselves in prior analyses instead of generating
// from nothing every time (see services/retrievalService.js).
//
// sourceId is a synthetic id (market reports aren't persisted as their
// own document; see chunkService for how it's built). owner is optional
// — market intelligence is treated as shared knowledge across users
// asking about the same role, not private to one account.
const mongoose = require('mongoose');
const { baseChunkFields } = require('./chunkSchemaFields');

const marketChunkSchema = new mongoose.Schema({
  ...baseChunkFields,
  sourceType: { type: String, enum: ['market_trends_report'], default: 'market_trends_report' },
}, { timestamps: true });

marketChunkSchema.index({ sourceId: 1 });

module.exports = mongoose.model('MarketChunk', marketChunkSchema, 'market_chunks');
