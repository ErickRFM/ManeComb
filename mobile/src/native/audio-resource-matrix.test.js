const fs = require('node:fs');
const path = require('node:path');

const NATIVE_ROOT = path.resolve(
  __dirname,
  '../../android/app/src/main/java/com/anonymous/combiscontrol'
);

function nativeSource(relativePath) {
  return fs.readFileSync(path.join(NATIVE_ROOT, relativePath), 'utf8');
}

/**
 * Matriz de recursos de audio del proceso. El microfono es exclusivo: Radio
 * (AudioRecord), las notas de voz de Chat (MediaRecorder) y las llamadas no
 * pueden tomarlo a la vez. RadioAudioSession es el arbitro porque ya es la
 * autoridad de quien posee el audio.
 */
describe('microphone has a single arbiter', () => {
  const audioSession = nativeSource('audio/RadioAudioSession.kt');
  const audioModule = nativeSource('audio/ManeCombAudioModule.kt');

  it('keeps the arbiter in the audio session that already owns the resource', () => {
    expect(audioSession).toContain('fun beginExternalCapture()');
    expect(audioSession).toContain('fun endExternalCapture()');
    expect(audioSession).toContain('fun ownsAudio()');
  });

  it('refuses PTT capture while another consumer holds the microphone', () => {
    expect(audioSession).toMatch(/if \(externalCaptureActive\)[\s\S]{0,200}return false/);
  });

  it('refuses voice-note recording while radio owns the audio', () => {
    // Antes, startRecording abria MediaRecorder sobre el MIC sin comprobar nada:
    // grabar una nota de voz durante una transmision tomaba el mismo microfono.
    const startRecording = audioModule.slice(
      audioModule.indexOf('fun startRecording('),
      audioModule.indexOf('fun stopRecording(')
    );
    expect(startRecording).toContain('beginExternalCapture()');
    expect(startRecording).toContain('radio_channel_active');
    expect(startRecording.indexOf('beginExternalCapture()')).toBeLessThan(
      startRecording.indexOf('MediaRecorder.AudioSource.MIC')
    );
  });

  it('always returns the microphone when the recorder is released', () => {
    const releaseRecorder = audioModule.slice(audioModule.indexOf('fun releaseRecorder('));
    expect(releaseRecorder).toContain('endExternalCapture()');
  });

  it('refuses history playback while radio owns the audio', () => {
    const startHistory = audioModule.slice(
      audioModule.indexOf('fun startRadioHistoryPlayer('),
      audioModule.indexOf('fun pauseRadioHistoryPlayer(')
    );
    expect(startHistory).toContain('ownsAudio()');
    expect(startHistory).toContain('radio_channel_active');
  });

  it('creates AudioRecord and AudioTrack in exactly one place', () => {
    const owners = fs
      .readdirSync(path.join(NATIVE_ROOT, 'audio'))
      .filter((name) => name.endsWith('.kt'))
      .filter((name) => {
        const source = nativeSource(`audio/${name}`);
        return /AudioRecord\(/.test(source) || /AudioTrack\.Builder\(\)/.test(source);
      });

    expect(owners).toEqual(['RadioAudioSession.kt']);
  });

  it('gives each foreground service a distinct resource declaration', () => {
    const manifest = fs.readFileSync(
      path.resolve(__dirname, '../../android/app/src/main/AndroidManifest.xml'),
      'utf8'
    );

    // Radio y Llamadas coordinan el microfono por estado (setRadioCallActive),
    // no compitiendo por el mismo tipo de servicio sin declararlo.
    expect(manifest).toContain(
      '.audio.ManeCombRadioService" android:exported="false" android:foregroundServiceType="mediaPlayback|microphone"'
    );
    expect(manifest).toContain(
      '.calls.ManeCombCallService" android:exported="false" android:foregroundServiceType="microphone|camera"'
    );
    expect(manifest).toContain(
      '.location.ManeCombLocationService" android:exported="false" android:foregroundServiceType="location"'
    );
  });
});
