import fs from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('call ringing feedback authority', () => {
  const overlay = read('./call-overlay.tsx');
  const bridge = read('../../native/call-service.ts');
  const nativeModule = read(
    '../../../android/app/src/main/java/com/anonymous/combiscontrol/calls/ManeCombCallModule.kt'
  );
  const feedback = read(
    '../../../android/app/src/main/java/com/anonymous/combiscontrol/calls/ManeCombCallFeedback.kt'
  );

  test('React only selects one native feedback mode', () => {
    expect(bridge).toContain("export type CallFeedbackMode = 'none' | 'incoming' | 'ringback'");
    expect(bridge).toContain('nativeModule.setCallFeedbackMode(mode, callId)');
    expect(nativeModule).toContain('ManeCombCallFeedback.setMode(reactContext, mode, callId)');
    expect(nativeModule).not.toContain('MediaPlayer');
    expect(nativeModule).not.toContain('Vibrator');
  });

  test('incoming ringing uses the call channel settings and respects system interruption state', () => {
    expect(feedback).toContain('RingtoneManager.TYPE_RINGTONE');
    expect(feedback).toContain('ManeCombPushNotificationRenderer.CHANNEL_CALLS');
    expect(feedback).toContain('channel.shouldVibrate()');
    expect(feedback).toContain('channel.vibrationPattern');
    expect(feedback).toContain('currentInterruptionFilter');
    expect(feedback).toContain('RINGER_MODE_SILENT');
    expect(feedback).toContain('RINGER_MODE_VIBRATE');
    expect(feedback).toContain('VibrationEffect.createWaveform');
  });

  test('outgoing ringing has local ringback and all feedback has deterministic cleanup', () => {
    expect(feedback).toContain('ToneGenerator.TONE_SUP_RINGTONE');
    expect(feedback).toContain('tone.stopTone()');
    expect(feedback).toContain('tone.release()');
    expect(feedback).toContain('incomingRingtone?.stop()');
    expect(feedback).toContain('incomingVibrator?.cancel()');
  });

  test('overlay starts feedback only in ringing phases and stops it on teardown', () => {
    expect(overlay).toContain("phase === 'OUTGOING_RINGING'");
    expect(overlay).toContain("phase === 'INCOMING_RINGING'");
    expect(overlay).toContain("nextFeedback = 'ringback'");
    expect(overlay).toContain("nextFeedback = 'incoming'");
    expect(overlay).toContain("setCallFeedbackMode('none')");
    expect(overlay).toContain("NativeAppState.addEventListener('change'");
  });
});
