const FormData = require('form-data');

const fetch = global.fetch || ((...a)=>import('node-fetch').then(m=>m.default(...a)));

const WEBHOOK = process.env.DISCORD_WEBHOOK || '';

async function sendMessage(content) {

  if (!WEBHOOK) return;

  try {

    await fetch(WEBHOOK, {
 method: 'POST', headers:{
 'Content-Type': 'application/json'}
, body: JSON.stringify({
 content }
) }
);

  }
 catch(e) {
}

}

async function sendFile(buffer, filename, content) {

  if (!WEBHOOK) return;

  try {

    const form = new FormData();

    form.append('file', buffer, {
 filename }
);

    if (content) form.append('content', content);

    await fetch(WEBHOOK, {
 method: 'POST', body: form }
);

  }
 catch(e) {
}

}

module.exports = {
 sendMessage, sendFile }
;

