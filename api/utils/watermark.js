const { PNG } = require('pngjs');
function embedMessageInPngBuffer(pngBuffer, message) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(pngBuffer, function(err, data) {
      if (err) return reject(err);
      const msgBuf = Buffer.from(message, 'utf8');
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(msgBuf.length, 0);
      const full = Buffer.concat([lenBuf, msgBuf]);
      const totalBits = full.length * 8;
      const capacity = data.data.length;
      if (totalBits > capacity) return reject(new Error('Image too small'));
      let bitIndex = 0;
      for (let i = 0; i < data.data.length && bitIndex < totalBits; i++) {
        const byteIndex = Math.floor(bitIndex / 8);
        const bitOffset = 7 - (bitIndex % 8);
        const bit = (full[byteIndex] >> bitOffset) & 1;
        data.data[i] = (data.data[i] & 0xFE) | bit;
        bitIndex++;
      }
      const outChunks = [];
      const outPng = new PNG({ width: data.width, height: data.height });
      outPng.data = data.data;
      outPng.pack().on('data', c => outChunks.push(c)).on('end', () => resolve(Buffer.concat(outChunks))).on('error', reject);
    });
  });
}
function extractMessageFromPngBuffer(pngBuffer) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(pngBuffer, function(err, data) {
      if (err) return reject(err);
      const getBit = i => (data.data[i] & 1);
      let len = 0;
      for (let i = 0; i < 32; i++) len = (len << 1) | getBit(i);
      if (len <= 0 || len > 5_000_000) return resolve(null);
      const out = Buffer.alloc(4 + len);
      for (let b = 0; b < 4 + len; b++) {
        let v = 0;
        for (let bit = 0; bit < 8; bit++) {
          const idx = b * 8 + bit;
          v = (v << 1) | getBit(idx);
        }
        out[b] = v;
      }
      const msg = out.slice(4).toString('utf8');
      resolve(msg);
    });
  });
}
module.exports = { embedMessageInPngBuffer, extractMessageFromPngBuffer };
