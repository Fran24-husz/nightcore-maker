// src/main.js

class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.audioBuffer = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.convolverNode = null;
    this.dryGainNode = null;
    this.wetGainNode = null;

    this.isPlaying = false;
    this.startTime = 0;
    this.pausedAt = 0;
    this.playbackRate = 1.25;
    this.volume = 1.0;
    this.reverbMix = 0.0;
    this.bassBoost = 0;
  }

  init() {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    
    this.bassFilter = this.audioContext.createBiquadFilter();
    this.bassFilter.type = "lowshelf";
    this.bassFilter.frequency.value = 150;
    this.bassFilter.gain.value = this.bassBoost;

    this.convolverNode = this.audioContext.createConvolver();
    this.dryGainNode = this.audioContext.createGain();
    this.wetGainNode = this.audioContext.createGain();

    this.gainNode.connect(this.bassFilter);
    this.bassFilter.connect(this.dryGainNode);
    this.dryGainNode.connect(this.audioContext.destination);

    this.bassFilter.connect(this.convolverNode);
    this.convolverNode.connect(this.wetGainNode);
    this.wetGainNode.connect(this.audioContext.destination);

    this.updateNodes();
    this.generateImpulseResponse(2.0, 2.0);
  }

  generateImpulseResponse(duration, decay) {
    if (!this.audioContext) return;
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const d = Math.pow(1 - i / length, decay);
      left[i] = (Math.random() * 2 - 1) * d;
      right[i] = (Math.random() * 2 - 1) * d;
    }
    this.convolverNode.buffer = impulse;
    this.impulseBuffer = impulse;
  }

  updateNodes() {
    if (!this.audioContext) return;
    this.gainNode.gain.value = this.volume;
    if (this.bassFilter) {
      this.bassFilter.gain.value = this.bassBoost;
    }
    
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

  setBassBoost(val) {
    this.bassBoost = val;
    this.updateNodes();
  }

  async loadFile(file) {
    this.init(); // Lazy initialization
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.pausedAt = 0;
    return this.audioBuffer;
  }

  play() {
    if (!this.audioBuffer) return;
    if (this.isPlaying) return;
    this.init();

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
        this.pausedAt = 0;
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
    if (this.isPlaying && this.audioContext) {
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

    const bassFilter = offlineCtx.createBiquadFilter();
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 150;
    bassFilter.gain.value = this.bassBoost;

    const convolver = offlineCtx.createConvolver();
    if (this.impulseBuffer) {
      convolver.buffer = this.impulseBuffer;
    } else {
      const length = sampleRate * 2.0;
      const impulse = offlineCtx.createBuffer(2, length, sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);
      for (let i = 0; i < length; i++) {
        const d = Math.pow(1 - i / length, 2.0);
        left[i] = (Math.random() * 2 - 1) * d;
        right[i] = (Math.random() * 2 - 1) * d;
      }
      convolver.buffer = impulse;
    }

    const dryGain = offlineCtx.createGain();
    const wetGain = offlineCtx.createGain();
    
    const wet = this.reverbMix;
    const dry = 1.0 - wet;
    wetGain.gain.value = wet;
    dryGain.gain.value = dry;

    source.connect(gain);
    gain.connect(bassFilter);
    bassFilter.connect(dryGain);
    dryGain.connect(offlineCtx.destination);

    bassFilter.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(offlineCtx.destination);

    source.start(0);

    return await offlineCtx.startRendering();
  }

  async bufferToWav(buffer, onProgress) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    
    const setUint16 = (pos, data) => view.setUint16(pos, data, true);
    const setUint32 = (pos, data) => view.setUint32(pos, data, true);

    // Write WAV header
    setUint32(0, 0x46464952); // "RIFF"
    setUint32(4, length - 8);
    setUint32(8, 0x45564157); // "WAVE"
    setUint32(12, 0x20746d66); // "fmt "
    setUint32(16, 16);
    setUint16(20, 1);
    setUint16(22, numOfChan);
    setUint32(24, buffer.sampleRate);
    setUint32(28, buffer.sampleRate * 2 * numOfChan);
    setUint16(32, numOfChan * 2);
    setUint16(34, 16);
    setUint32(36, 0x61746164); // "data"
    setUint32(40, length - 44);

    const channels = [];
    for (let i = 0; i < numOfChan; i++) {
      channels.push(buffer.getChannelData(i));
    }

    const wavView = new Int16Array(bufferArray, 44);
    const bufLen = buffer.length;
    let offset = 0;

    while (offset < bufLen) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = channels[i][offset];
        sample = sample < 0 ? sample * 32768 : sample * 32767;
        wavView[offset * numOfChan + i] = sample;
      }
      offset++;

      if (offset % 100000 === 0) {
        if (onProgress) {
          const pct = Math.round((offset / bufLen) * 100);
          onProgress(pct);
        }
        await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
      }
    }

    return bufferArray;
  }

  async bufferToMp3(buffer, onProgress) {
    if (typeof lamejs === 'undefined') {
      throw new Error("lamejs not loaded");
    }
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128); // 128kbps
    
    const mp3Data = [];
    const left = buffer.getChannelData(0);
    const right = channels === 2 ? buffer.getChannelData(1) : null;

    const sampleBlockSize = 1152; // multiple of 576
    const leftChunk = new Int16Array(sampleBlockSize);
    const rightChunk = channels === 2 ? new Int16Array(sampleBlockSize) : null;
    const bufLen = buffer.length;

    for (let i = 0; i < bufLen; i += sampleBlockSize) {
      const chunkLen = Math.min(sampleBlockSize, bufLen - i);

      for (let j = 0; j < chunkLen; j++) {
        let sample = left[i + j];
        leftChunk[j] = sample < 0 ? sample * 32768 : sample * 32767;

        if (channels === 2) {
          let rSample = right[i + j];
          rightChunk[j] = rSample < 0 ? rSample * 32768 : rSample * 32767;
        }
      }

      let mp3buf;
      if (channels === 2) {
        if (chunkLen < sampleBlockSize) {
          mp3buf = mp3encoder.encodeBuffer(leftChunk.subarray(0, chunkLen), rightChunk.subarray(0, chunkLen));
        } else {
          mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        }
      } else {
        if (chunkLen < sampleBlockSize) {
          mp3buf = mp3encoder.encodeBuffer(leftChunk.subarray(0, chunkLen));
        } else {
          mp3buf = mp3encoder.encodeBuffer(leftChunk);
        }
      }

      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }

      if (i % (sampleBlockSize * 100) === 0) {
        if (onProgress) {
          const pct = Math.round((i / bufLen) * 100);
          onProgress(pct);
        }
        await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    
    return mp3Data;
  }
}

const audioProcessor = new AudioProcessor();

// Variables globales para almacenar el archivo y el estado
let selectedFile = null;
let isPremium = false;
let animationFrameId = null;

// 1. CAPTURA DE ELEMENTOS DEL DOM
const dropzone = document.getElementById('dropzone');
const audioFileInput = document.getElementById('audio-file');
const trackName = document.getElementById('track-name');
const btnPlay = document.getElementById('btn-play');
const statusText = document.getElementById('status-text');

// Elementos de los Sliders
const sliderVolume = document.getElementById('slider-volume');
const valVolume = document.getElementById('val-volume');

const sliderSpeed = document.getElementById('slider-speed');
const valSpeed = document.getElementById('val-speed');

const sliderReverb = document.getElementById('slider-reverb');
const valReverb = document.getElementById('val-reverb');

const sliderBass = document.getElementById('slider-bass');
const valBass = document.getElementById('val-bass');

const progressBar = document.getElementById('progress-bar');
const currentTimeDisplay = document.getElementById('current-time');
const totalTimeDisplay = document.getElementById('total-time');
const progressBarContainer = progressBar.parentElement;
progressBarContainer.classList.add('cursor-pointer');

// Botones de descarga y login
const btnDownloadMp3 = document.getElementById('btn-download-mp3');
const btnDownloadWav = document.getElementById('btn-download-wav');
const btnLogin = document.getElementById('btn-login');
const premiumBadge = document.getElementById('premium-badge');

// Auth Logic
function checkAuthStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const premiumStatus = urlParams.get('premium');
  
  if (premiumStatus === 'true') {
    setPremium(true);
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (premiumStatus === 'false') {
    setPremium(false);
    alert('No active Premium subscription found. Redirecting to Patreon so you can subscribe!');
    window.location.href = 'https://www.patreon.com/c/FrankszkyNightcore/membership';
  } else {
    setPremium(false);
  }
}

function setPremium(premium) {
  isPremium = premium;
  if (premium) {
    btnLogin.classList.add('hidden');
    premiumBadge.classList.remove('hidden');
    btnDownloadWav.classList.remove('opacity-75');
    btnDownloadMp3.classList.remove('opacity-75');
    sliderBass.disabled = false;
    sliderBass.classList.remove('cursor-not-allowed');
    sliderBass.parentElement.classList.remove('opacity-60');
  } else {
    btnLogin.classList.remove('hidden');
    premiumBadge.classList.add('hidden');
    btnDownloadWav.classList.add('opacity-75');
    btnDownloadMp3.classList.add('opacity-75');
    sliderBass.disabled = true;
    sliderBass.classList.add('cursor-not-allowed');
    sliderBass.parentElement.classList.add('opacity-60');
  }
}

btnLogin.addEventListener('click', () => {
  window.open('https://nightcore-maker-bbc8.onrender.com/auth/patreon', 'Patreon Auth', 'width=600,height=700');
});

// Escuchar la respuesta de éxito desde la ventana popup
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://nightcore-maker-bbc8.onrender.com') return;
  if (event.data === 'patreon_success') {
    setPremium(true);
  }
});

// Inicializar Auth Check
checkAuthStatus();

// Exponer la función a nivel global (window) para facilitar el testing en consola
window.setPremium = setPremium;

// 1.5 LÓGICA DEL MODAL DE INFORMACIÓN (Footer)
const modal = document.getElementById('info-modal');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');
const closeModal = document.getElementById('close-modal');

const contentData = {
  privacy: {
    title: 'Privacy Policy',
    html: `
      <p>🔒 <strong>Your privacy is our priority:</strong> NightcoreMaker executes all audio manipulation directly on your machine. We do not transfer, store, or upload your audio files to any external servers.</p>
      <p>💻 <strong>Local Processing:</strong> Every processing task is performed within your web browser utilizing the native Web Audio API. Your original files never leave the safety of your local environment.</p>
      <p>📊 <strong>Information & Metrics:</strong> We utilize privacy-friendly analytics (such as Cloudflare Analytics) to monitor basic network performance and anonymous platform metrics without deploying tracking cookies. We strictly do not collect, store, or share personal user data.</p>
    `
  },
  terms: {
    title: 'Terms of Use',
    html: `
      <p>📋 <strong>Agreement to Terms:</strong> By accessing and utilizing NightcoreMaker, you explicitly acknowledge and agree to comply with these terms of service. If you do not agree, please discontinue the use of this web application.</p>
      <p>🔧 <strong>Platform Purpose:</strong> NightcoreMaker provides an online, browser-based audio modification utility designed for personal, creative, and recreational purposes.</p>
      <p>✅ <strong>Acceptable & Lawful Use:</strong> You agree to use this tool strictly for legitimate activities. You are prohibited from processing files that violate intellectual property laws or infringe upon third-party copyrights.</p>
      <p>⚠️ <strong>Limitation of Liability:</strong> This software utility is delivered on an "as is" and "as available" basis without warranties of any kind. The platform developers shall not be held liable for any damages resulting from the use of this tool. You assume full legal responsibility for the media content you choose to process.</p>
    `
  },
  contact: {
    title: 'Contact',
    html: `
      <p>📬 <strong>Get in Touch:</strong> If you have any questions, feedback, feature requests, or technical inquiries regarding NightcoreMaker, feel free to reach out to us. We are always looking to improve the platform.</p>
      <p>✉️ <strong>Support Email:</strong> You can contact our team directly via email at <a href="mailto:elforastero46@gmail.com" class="text-purple-400 hover:text-purple-300 underline transition-colors">elforastero46@gmail.com</a>. We do our best to respond to all legitimate inquiries as quickly as possible.</p>
      <p>💼 <strong>Business & Partnerships:</strong> For commercial inquiries, advertising opportunities, or copyright-related matters, please use the official support email listed above.</p>
    `
  }
};

function openInfoModal(type) {
  modalTitle.textContent = contentData[type].title;
  modalContent.innerHTML = contentData[type].html;
  modal.classList.remove('hidden');
}

document.getElementById('btn-privacy').addEventListener('click', () => openInfoModal('privacy'));
document.getElementById('btn-terms').addEventListener('click', () => openInfoModal('terms'));
document.getElementById('btn-contact').addEventListener('click', () => openInfoModal('contact'));

closeModal.addEventListener('click', () => {
  modal.classList.add('hidden');
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.add('hidden');
  }
});

// 2. LÓGICA DE LOS SLIDERS (Actualización de textos y motor de audio en tiempo real)
sliderVolume.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  const pct = Math.round(val * 100);
  valVolume.textContent = `${pct}%`;
  audioProcessor.setVolume(val);
});

sliderSpeed.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  const speed = val.toFixed(2);
  valSpeed.textContent = `${speed}x`;
  audioProcessor.setPlaybackRate(val);
  updateTimeDisplay();
});

sliderReverb.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  const pct = Math.round(val * 100);
  valReverb.textContent = `${pct}%`;
  audioProcessor.setReverbMix(val);
});

// Este slider está deshabilitado por defecto para usuarios gratis
sliderBass.addEventListener('input', (e) => {
  const pct = Math.round((e.target.value / 10) * 100);
  valBass.textContent = `${pct}%`;
  audioProcessor.setBassBoost(parseFloat(e.target.value));
});


// 3. LÓGICA DE SUBIDA DE ARCHIVOS (Click y Drag & Drop)
dropzone.addEventListener('click', () => {
  audioFileInput.click();
});

audioFileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelection(e.target.files[0]);
  }
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.remove('border-gray-700');
  dropzone.classList.add('border-neonMagenta', 'bg-cyberDark');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('border-neonMagenta', 'bg-cyberDark');
  dropzone.classList.add('border-gray-700');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('border-neonMagenta', 'bg-cyberDark');
  dropzone.classList.add('border-gray-700');

  if (e.dataTransfer.files.length > 0) {
    handleFileSelection(e.dataTransfer.files[0]);
  }
});

// Función central que procesa el archivo elegido
async function handleFileSelection(file) {
  // Validar que sea un archivo de audio
  if (!file.type.startsWith('audio/') && !file.name.endsWith('.mp3') && !file.name.endsWith('.wav')) {
    statusText.textContent = "Error: Please select a valid audio file (.mp3 or .wav)";
    statusText.className = "text-center text-[11px] text-red-500 italic mt-2";
    return;
  }

  if (audioProcessor.isPlaying) {
    audioProcessor.pause();
    cancelAnimationFrame(animationFrameId);
  }

  selectedFile = file;
  trackName.textContent = file.name;
  statusText.textContent = "Loading audio...";
  statusText.className = "text-center text-[11px] text-neonCyan italic mt-2";

  try {
    await audioProcessor.loadFile(file);
    
    // Reproducción automática
    audioProcessor.play();
    btnPlay.innerHTML = '<svg class="w-6 h-6 fill-cyberDark" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'; // Icono Pausa
    statusText.textContent = "Playing preview...";
    statusText.className = "text-center text-[11px] text-neonCyan italic mt-2";
    updateProgress();
    
  } catch (error) {
    console.error(error);
    statusText.textContent = "Error loading audio.";
    statusText.className = "text-center text-[11px] text-red-500 italic mt-2";
  }
}


// 4. BOTONES DE ACCIÓN (Integrados con AudioProcessor)
btnPlay.addEventListener('click', () => {
  if (!selectedFile || !audioProcessor.audioBuffer) {
    statusText.textContent = "Please upload an audio file first.";
    statusText.className = "text-center text-[11px] text-amber-500 italic mt-2";
    return;
  }

  if (audioProcessor.isPlaying) {
    audioProcessor.pause();
    btnPlay.innerHTML = '<svg class="w-6 h-6 fill-cyberDark" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; // Icono Play
    statusText.textContent = "Preview paused.";
    cancelAnimationFrame(animationFrameId);
  } else {
    audioProcessor.play();
    btnPlay.innerHTML = '<svg class="w-6 h-6 fill-cyberDark" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'; // Icono Pausa
    statusText.textContent = "Playing preview...";
    updateProgress();
  }
});

// Al terminar la pista naturalmente
audioProcessor.onEndedCallback = () => {
  btnPlay.innerHTML = '<svg class="w-6 h-6 fill-cyberDark" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; // Icono Play
  statusText.textContent = "Playback ended.";
  cancelAnimationFrame(animationFrameId);
  progressBar.style.width = '0%';
  updateTimeDisplay();
};

function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateTimeDisplay() {
  const duration = audioProcessor.getDuration() / audioProcessor.playbackRate;
  const current = audioProcessor.getCurrentTime() / audioProcessor.playbackRate;
  currentTimeDisplay.textContent = formatTime(current);
  totalTimeDisplay.textContent = formatTime(duration);
  progressBar.style.width = duration > 0 ? `${(current / duration) * 100}%` : '0%';
}

function updateProgress() {
  updateTimeDisplay();
  if (audioProcessor.isPlaying) {
    animationFrameId = requestAnimationFrame(updateProgress);
  }
}

// Interacción para navegar en la canción
progressBarContainer.addEventListener('click', (e) => {
  if (!audioProcessor.audioBuffer) return;
  const rect = progressBarContainer.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const ratio = x / rect.width;
  const targetTime = ratio * (audioProcessor.getDuration() / audioProcessor.playbackRate);
  audioProcessor.seek(targetTime);
  updateTimeDisplay();
});

btnDownloadMp3.addEventListener('click', () => {
  if (!selectedFile) return;
  if (!isPremium) {
    alert("This feature is exclusive for Premium Members. Please connect your Patreon account.");
    return;
  }
  downloadProcessMp3();
});

btnDownloadWav.addEventListener('click', () => {
  if (!selectedFile) return;
  if (!isPremium) {
    alert("This feature is exclusive for Premium Members. Please connect your Patreon account.");
    return;
  }
  downloadProcess();
});

async function downloadProcess() {
  if (!audioProcessor.audioBuffer) return;
  
  statusText.textContent = 'Rendering audio offline... this may take a moment.';
  statusText.className = "text-center text-[11px] text-neonMagenta italic mt-2 animate-pulse";
  
  try {
    const renderedBuffer = await audioProcessor.renderOffline();
    const wavData = await audioProcessor.bufferToWav(renderedBuffer, (pct) => {
      statusText.textContent = `Rendering WAV: ${pct}%...`;
    });
    const blob = new Blob([wavData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `nightcore_${selectedFile.name.split('.')[0]}.wav`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    statusText.textContent = 'Download ready!';
    statusText.className = "text-center text-[11px] text-neonCyan italic mt-2";
  } catch (err) {
    console.error(err);
    statusText.textContent = 'Error rendering audio.';
    statusText.className = "text-center text-[11px] text-red-500 italic mt-2";
  }
}

async function downloadProcessMp3() {
  if (!audioProcessor.audioBuffer) return;
  
  statusText.textContent = 'Encoding MP3... this may take a moment.';
  statusText.className = "text-center text-[11px] text-neonMagenta italic mt-2 animate-pulse";
  
  try {
    const renderedBuffer = await audioProcessor.renderOffline();
    const mp3Data = await audioProcessor.bufferToMp3(renderedBuffer, (pct) => {
      statusText.textContent = `Encoding MP3: ${pct}%...`;
    });
    const blob = new Blob(mp3Data, { type: 'audio/mp3' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `nightcore_${selectedFile.name.split('.')[0]}.mp3`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    statusText.textContent = 'MP3 Download ready!';
    statusText.className = "text-center text-[11px] text-neonCyan italic mt-2";
  } catch (err) {
    console.error(err);
    statusText.textContent = 'Error encoding MP3.';
    statusText.className = "text-center text-[11px] text-red-500 italic mt-2";
  }
}
