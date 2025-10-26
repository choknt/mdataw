const mongoose = require('mongoose');
const MONGO = process.env.MONGO_URI || '';
let conn = null;
async function connect() {
  if (conn) return conn;
  conn = await mongoose.connect(MONGO, { });
  return conn;
}
const KeySchema = new mongoose.Schema({
  key: String, name: String, userId: String, email: String, isAdmin: {type:Boolean, default:false}, adminCode: String, boundFingerprints: [String], createdAt: {type:Date, default:Date.now}, status: {type:String, default:'active'}, failedAttempts: {type:Number, default:0}, lockedUntil: Date
});
const AccessLogSchema = new mongoose.Schema({
  keyId: String, userId: String, ip: String, ua: String, fp: String, ts: Date, note: String
}, { timestamps: false });
const EntrySchema = new mongoose.Schema({
  keyId: String, userId: String, title: String, content: String, month: Number, year: Number, createdAt: {type:Date, default:Date.now}, imagePath: String
});
const Key = mongoose.models.Key || mongoose.model('Key', KeySchema);
const AccessLog = mongoose.models.AccessLog || mongoose.model('AccessLog', AccessLogSchema);
const Entry = mongoose.models.Entry || mongoose.model('Entry', EntrySchema);
module.exports = { connect, Key, AccessLog, Entry };
