// Convertește microfonul în blocuri PCM16 mono la 16 kHz, gata de trimis spre Gemini Live.
//
// De ce reeșantionăm aici, deși app.js cere `new AudioContext({ sampleRate: 16000 })`:
// cererea aia e o SUGESTIE. Chrome pe Android o respectă, dar Safari/iOS (și unele Android-uri
// cu anumite căști) ignoră valoarea și îți dau contextul la rata hardware-ului, de obicei 48 kHz.
// Fără verificare, am trimite 48 kHz etichetat ca 16 kHz — Gemini ar auzi o voce groasă și
// întinsă de trei ori, n-ar înțelege nimic, și n-ar exista niciun mesaj de eroare nicăieri.
//
// `sampleRate` de mai jos e globala din AudioWorkletGlobalScope: rata REALĂ a contextului.

const BLOCK_SAMPLES = 2048; // ~128 ms la 16 kHz — destul de mic pentru a nu se simți întârziere

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const target = (options && options.processorOptions && options.processorOptions.targetSampleRate) || 16000;

    this.ratio = sampleRate / target; // 1 dacă browserul a respectat cererea
    this.buffer = new Int16Array(BLOCK_SAMPLES);
    this.filled = 0;
    this.leftover = new Float32Array(0); // coada blocului precedent, pentru interpolare peste graniță
    this.offset = 0; // poziția fracționară de citire în interiorul sursei

    this.port.postMessage({ type: 'rate', input: sampleRate, output: target });
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    // Lipim coada rămasă de blocul nou: un eșantion reeșantionat poate cădea între ultimul
    // eșantion al unui bloc și primul al următorului.
    let source;
    if (this.leftover.length > 0) {
      source = new Float32Array(this.leftover.length + channel.length);
      source.set(this.leftover, 0);
      source.set(channel, this.leftover.length);
    } else {
      source = channel;
    }

    let i = this.offset;
    while (i < source.length - 1) {
      const index = Math.floor(i);
      const frac = i - index;
      // Interpolare liniară — suficientă pentru voce la raporturi mici (48→16 e exact 3:1).
      const value = source[index] * (1 - frac) + source[index + 1] * frac;

      const clamped = Math.max(-1, Math.min(1, value));
      this.buffer[this.filled] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.filled += 1;

      if (this.filled === BLOCK_SAMPLES) {
        const out = this.buffer.slice(); // copie proprie, transferată
        this.port.postMessage({ type: 'audio', data: out.buffer }, [out.buffer]);
        this.filled = 0;
      }

      i += this.ratio;
    }

    const consumed = Math.floor(i);
    this.leftover = source.slice(consumed);
    this.offset = i - consumed;

    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
