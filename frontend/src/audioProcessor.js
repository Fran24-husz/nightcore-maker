export class AudioProcessor {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.audioBuffer = null;
    this.sourceNode = null;
    this.gainNode = this.audioContext.createGain();
    this.convolverNode = this.audioContext.createConvolver();
    this.dryGainNode = this.audioContext.createGain();
    this.wetGainNode = this.audioContext.createGain();

    // Setup audio routing
    this.gainNode.connect(this.dryGainNode);
    this.dryGainNode.connect(this.audioContext.destination);

    this.gainNode.connect(this.convolverNode);
    this.convolverNode.connect(this.wetGainNode);
    this.wetGainNode.connect(this.audioContext.destination);

    // Initial state
    this.isPlaying = false;
    this.startTime = 0;
    this.pausedAt = 0;
    this.playbackRate = 1.25;
    this.volume = 1.0;
    this.reverbMix = 0.0;
    
    this.updateNodes();
    this.generateImpulseResponse(2.0, 2.0); // Default IR length and decay
  }

  // Generate a synthetic impulse response for the convolver (Reverb)
  generateImpulseResponse(duration, decay) {
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i === 0 ? 1 : 0;
      left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    this.convolverNode.buffer = impulse;
  }

  updateNodes() {
    this.gainNode.gain.value = this.volume;
    
    // Equal power crossfade for reverb
    const wet = this.reverbMix;
    const dry = 1.0 - wet;
    this.wetGainNode.gain.value = wet;
    this.dryGainNode.gain.value = dry;

    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.playbackRate;
    }
  }

  setVolume(val) {
    this.volume = val;
    this.updateNodes();
  }

  setPlaybackRate(val) {
    this.playbackRate = val;
    this.updateNodes();
  }

  setReverbMix(val) {
    this.reverbMix = val;
    this.updateNodes();
  }

  async loadFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.pausedAt = 0;
    return this.audioBuffer;
  }

  play() {
    if (!this.audioBuffer) return;
    if (this.isPlaying) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode);
    this.sourceNode.playbackRate.value = this.playbackRate;

    this.sourceNode.start(0, this.pausedAt);
    this.startTime = this.audioContext.currentTime - (this.pausedAt / this.playbackRate);
    this.isPlaying = true;

    this.sourceNode.onended = () => {
      if (this.isPlaying && this.getCurrentTime() >= this.getDuration()) {
        this.pause();
        this.pausedAt = 0; // reset
        if (this.onEndedCallback) this.onEndedCallback();
      }
    };
  }

  pause() {
    if (!this.isPlaying) return;
    this.sourceNode.stop();
    this.pausedAt = (this.audioContext.currentTime - this.startTime) * this.playbackRate;
    this.isPlaying = false;
  }

  getCurrentTime() {
    if (this.isPlaying) {
      return (this.audioContext.currentTime - this.startTime) * this.playbackRate;
    }
    return this.pausedAt;
  }

  getDuration() {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  seek(time) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pausedAt = time;
    if (wasPlaying) this.play();
  }

  // Draw waveform to canvas
  drawWaveform(canvas) {
    if (!this.audioBuffer) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    const data = this.audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / cssWidth);
    const amp = cssHeight / 2;

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#00ffff'; // cyber-cyan

    for (let i = 0; i < cssWidth; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const y = (1 + min) * amp;
      const h = Math.max(1, (max - min) * amp);
      ctx.fillRect(i, y, 1, h);
    }
  }

  // Render to a new buffer for export
  async renderOffline() {
    if (!this.audioBuffer) return null;

    const duration = this.audioBuffer.duration / this.playbackRate;
    const sampleRate = this.audioBuffer.sampleRate;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

    const source = offlineCtx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.playbackRate.value = this.playbackRate;

    const gain = offlineCtx.createGain();
    gain.gain.value = this.volume;

    const convolver = offlineCtx.createConvolver();
    // Recreate IR for offline context
    const length = sampleRate * 2.0;
    const impulse = offlineCtx.createBuffer(2, length, sampleRate);
    for (let i = 0; i < length; i++) {
      impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.0);
      impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.0);
    }
    convolver.buffer = impulse;

    const dryGain = offlineCtx.createGain();
    const wetGain = offlineCtx.createGain();
    
    const wet = this.reverbMix;
    const dry = 1.0 - wet;
    wetGain.gain.value = wet;
    dryGain.gain.value = dry;

    source.connect(gain);
    gain.connect(dryGain);
    dryGain.connect(offlineCtx.destination);

    gain.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(offlineCtx.destination);

    source.start(0);

    return await offlineCtx.startRendering();
  }

  // Convert AudioBuffer to WAV ArrayBuffer
  bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // Write WAV header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    function setUint16(data) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data) {
      view.setUint32(pos, data, true);
      pos += 4;
    }

    return bufferArray;
  }
}
