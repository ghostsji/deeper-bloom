// Neural voices through Microsoft Edge's read-aloud service (the same voices as the
// edge-tts Python package). Needs internet the first time a line is spoken; every result
// is cached on disk, so a line only ever downloads once.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

function createTTS(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  let voiceList = null;

  // One request at a time keeps the service happy and the cache simple.
  let chain = Promise.resolve();
  const queued = (fn) => (chain = chain.then(fn, fn));

  // The service rate-limits bursts (HTTP 429); back off and try again.
  async function render(text, voice, rate, pitch, tries = 4) {
    for (let n = 0; ; n++) {
      try {
        return await renderOnce(text, voice, rate, pitch);
      } catch (err) {
        if (n + 1 >= tries || !/429|ECONNRESET|socket|timed out/i.test(String(err?.message))) throw err;
        await new Promise((r) => setTimeout(r, 2500 * 2 ** n));
      }
    }
  }

  async function renderOnce(text, voice, rate, pitch) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, FORMAT);
      const { audioStream } = tts.toStream(text, { rate, pitch });
      const chunks = [];
      await new Promise((resolve, reject) => {
        audioStream.on('data', (c) => chunks.push(c));
        audioStream.on('end', resolve);
        audioStream.on('error', reject);
      });
      return Buffer.concat(chunks);
    } finally {
      tts.close();
    }
  }

  return {
    async voices() {
      if (!voiceList) {
        const tts = new MsEdgeTTS();
        try {
          voiceList = (await tts.getVoices())
            .map((v) => ({ name: v.ShortName, locale: v.Locale, gender: v.Gender }))
            .sort((a, b) => a.locale.localeCompare(b.locale) || a.name.localeCompare(b.name));
        } finally {
          tts.close();
        }
      }
      return voiceList;
    },
    // Returns MP3 bytes for a line, from the cache when possible.
    synth({ text, voice, rate = '+0%', pitch = '+0Hz' }) {
      const key = crypto.createHash('sha1').update(JSON.stringify([voice, rate, pitch, text])).digest('hex');
      const file = path.join(cacheDir, `${key}.mp3`);
      if (fs.existsSync(file)) return Promise.resolve(fs.readFileSync(file));
      return queued(async () => {
        const audio = await render(text, voice, rate, pitch);
        if (!audio.length) throw new Error('The voice service returned no audio');
        fs.writeFileSync(file, audio);
        return audio;
      });
    },
    render,
  };
}

module.exports = { createTTS };
