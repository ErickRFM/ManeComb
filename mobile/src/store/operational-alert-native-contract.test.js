import fs from 'node:fs';
import path from 'node:path';

function androidSource(name) {
  return fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/java/com/anonymous/combiscontrol/notifications', name), 'utf8');
}

describe('operational alert native channel authority', () => {
  const renderer = androidSource('ManeCombPushNotificationRenderer.kt');
  const module = androidSource('ManeCombNotificationModule.kt');
  const policy = androidSource('ManeCombAlertPolicy.kt');

  test('foreground FCM is not discarded and socket delegates to the same renderer', () => {
    const operational = renderer.slice(renderer.indexOf('fun showOperationalAlert'), renderer.indexOf('fun showMessage'));
    expect(operational).not.toContain('isAppInForeground(context)');
    expect(module).toContain('ManeCombPushNotificationRenderer.showOperationalAlert');
    const playBlock = module.slice(module.indexOf('fun playOperationalAlert'), module.indexOf('fun show('));
    expect(playBlock).not.toContain('MediaPlayer');
    expect(playBlock).not.toContain('Vibrator');
  });

  test('lockscreen public title is generic and private business title is not reused', () => {
    const operational = renderer.slice(renderer.indexOf('fun showOperationalAlert'), renderer.indexOf('fun showMessage'));
    const publicBlock = operational.slice(operational.indexOf('val publicVersion'), operational.indexOf('val builder'));
    expect(publicBlock).toContain('.setContentTitle(publicTitle)');
    expect(publicBlock).not.toContain('.setContentTitle(title)');
    expect(operational).toContain('Alerta SOS de ManeComb');
    expect(operational).toContain('Alerta operativa de ManeComb');
  });

  test('dedup horizon exceeds the 60 second operational FCM TTL', () => {
    expect(policy).toContain('const val DEDUP_WINDOW_MS = 75_000L');
  });
});
