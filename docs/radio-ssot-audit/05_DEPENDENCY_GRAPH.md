# Radio Dependency Graph

```text
useAppStore
|- token/user/networkStatus
|- conversations/messagesByConversation
|- activeConversationId/loadConversation
`- REST history actions

RadioRealtimeService
|- dedicated socket
|- connection callbacks
`- live PTT events

RadioScreen local facts
|- activeChannelId
|- recordingState + recordingStateRef
|- receiving/busy/operator
|- realtimeConnectionState
`- timers and resource refs

Native audio bridge
|- capture subscriptions
|- AudioRecord/AudioTrack
`- MediaPlayer/Visualizer sessions
```

## Effects and cleanup

| Effect | Dependencies | Cleanup |
|---|---|---|
| create realtime service | user id, recording callback, shared level | disconnect, stop capture/playback |
| connect/channel/service | token, active channel id | stop foreground service |
| native PTT subscriptions | stable callback/shared level | remove all three subscriptions |
| Web device enumeration | Store contact loader | remove `devicechange` |
| Web output observer | selected output | disconnect MutationObserver |
| channel synchronization | Store/local channel values | none |
| player polling | player identity/source | clear interval, stop player |
| lifecycle hook | refs/callbacks | clear timers and release media |

`recordingStateRef` is a manual synchronization mirror required by asynchronous callbacks. `activeChannelId` and Store `activeConversationId` are two writable channel selections and are not SSOT compliant.
