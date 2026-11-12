// Echo's default voice: soft, slow and underwater. Shared by the game's Settings screen and
// `npm run voices` (which bakes the bundled lines with VOICE, RATE and PITCH; the FX are
// applied live in the game, so they stay adjustable).
export const VOICE_DEFAULTS = {
  source: 'bundled',          // bundled | live | system | off
  pack: 'sonia',              // which built-in voice pack (see VOICE_PACKS)
  systemVoice: '',            // a system voice by name ('' picks a soft female one)
  voice: 'en-GB-SoniaNeural',
  rate: -18,                  // percent: slower, so Echo never rushes you
  pitch: -2,                  // Hz
  volume: 0.85,
  gap: 1.4,                   // seconds of quiet between lines
  // FX rack, same controls as the Black Relay voice studio.
  roomSize: 0.85,
  wet: 0.42,
  damping: 0.6,
  dry: 0.75,
  cutoff: 2600,               // Hz
  // Sound (Settings → Sound): the game's volume groups, 0..1.
  masterVol: 1,
  musicVol: 1,
  sfxVol: 1,
  uiVol: 1,
  muted: false,
};

export const rateStr = (n) => `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
export const pitchStr = (n) => `${n >= 0 ? '+' : ''}${Math.round(n)}Hz`;
export const lineFile = (key, i) => `echo_${key}_${i}.mp3`;

// Echo's built-in voices: each is a full set of her lines, bundled so it works offline
// (assets/voice/<id>/, made by `npm run voices`). All use the default slow rate and pitch.
export const VOICE_PACKS = [
  { id: 'sonia', voice: 'en-GB-SoniaNeural', name: 'Echo: soft (Sonia, UK)' },
  { id: 'libby', voice: 'en-GB-LibbyNeural', name: 'Echo: gentle (Libby, UK)' },
  { id: 'aria', voice: 'en-US-AriaNeural', name: 'Echo: warm (Aria, US)' },
  { id: 'jenny', voice: 'en-US-JennyNeural', name: 'Echo: calm (Jenny, US)' },
  { id: 'natasha', voice: 'en-AU-NatashaNeural', name: 'Echo: bright (Natasha, AU)' },
  { id: 'clara', voice: 'en-CA-ClaraNeural', name: 'Echo: clear (Clara, CA)' },
  { id: 'ryan', voice: 'en-GB-RyanNeural', name: 'Echo: deep (Ryan, UK)' },
];
export const packById = (id) => VOICE_PACKS.find((p) => p.id === id) || VOICE_PACKS[0];
