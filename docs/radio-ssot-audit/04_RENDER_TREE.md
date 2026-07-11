# Radio Render Tree

```text
RadioScreen
|- AppShell header
|  |- StatusPill: liveStatus
|  |- channel connection: realtimeConnectionState
|  `- operator count: activeChannel.participants.length
|- horizontal pager
|  |- Channels
|  |  |- search: local search
|  |  `- cards: Store conversations
|  |- Console PTT
|  |  |- title/banner: liveStatus
|  |  |- PTT Pressable: recordingState + pttAvailability
|  |  |- WaveBar x18: volumeValue
|  |  |- phase: radioPhase
|  |  |- channel: realtimeConnectionState
|  |  |- duration: recordingSeconds/MAX
|  |  `- latest: loadedVoiceNotes[0]
|  `- Audios
|     |- filters: local audioFilter + derived availability
|     `- FlatList
|        `- VoiceTransmissionCard
|           |- Play/Pause: native playing/buffering
|           |- time: native current/duration after prepare
|           |- waveform: native Visualizer level
|           `- status: native PlayerStatus + local operation error
`- page indicators: activePageIndex
```

No visible signal-strength bars or unverifiable local operation averages remain in the current tree.
