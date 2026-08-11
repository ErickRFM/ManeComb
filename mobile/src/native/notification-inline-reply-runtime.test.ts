const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('Android chat notification inline reply runtime', () => {
  const mobileRoot = nodeProcess.cwd();
  const androidNotifications = path.join(
    mobileRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'anonymous',
    'combiscontrol',
    'notifications'
  );

  it('offers RemoteInput for FCM chat cards even when the visual payload says E2EE', () => {
    const renderer = fs.readFileSync(
      path.join(androidNotifications, 'ManeCombPushNotificationRenderer.kt'),
      'utf8'
    );

    expect(renderer).toContain('builder.addAction(buildReplyAction(context, notificationId, conversationId))');
    expect(renderer).toContain('E2EE_REPLY_SUBTEXT = "Cifrado de extremo a extremo"');
    expect(renderer).not.toContain('Chat cifrado: abre la app para responder');
  });

  it('offers the same RemoteInput path for foreground/local chat notifications', () => {
    const module = fs.readFileSync(
      path.join(androidNotifications, 'ManeCombNotificationModule.kt'),
      'utf8'
    );

    expect(module).toContain('.addAction(buildReplyAction(notificationId, safeConversationId))');
    expect(module).toContain('E2EE_REPLY_SUBTEXT = "Cifrado de extremo a extremo"');
    expect(module).not.toContain('Chat cifrado: abre la app para responder');
  });

  it('keeps reply status on the chat channel and removes successful cards shortly after send', () => {
    const receiver = fs.readFileSync(
      path.join(androidNotifications, 'ManeCombReplyReceiver.kt'),
      'utf8'
    );

    expect(receiver).toContain('ManeCombPushNotificationRenderer.CHANNEL_CHAT');
    expect(receiver).toContain('.setOnlyAlertOnce(true)');
    expect(receiver).toContain('setTimeoutAfter(SENT_STATUS_TIMEOUT_MS)');
  });
});
