# Dead Code Report

## Removed before this audit

- Radio metrics reducer and `RESET_METRICS`.
- Parallel `activePlayback` state machine.
- Playback guard timer and callback phases.
- Legacy native recorder instance in Radio.
- Fake signal bars and local TX/RX averages.

## Remaining candidates

| Candidate | Evidence | Decision |
|---|---|---|
| `hoveredRadioItemId` on native | only Web handlers consume it | live Web code, keep |
| Web recorder/upload path | Platform Web only | live compatibility path, keep |
| REST Radio routes | Web/manual upload and history API | live backend path, keep |
| transition table | only validates logs/tests | diagnostic consumer exists, keep |
| `keepAudioSessionActive` player option | declared but not read by hook | dead option, outside Radio-only ownership because Chat passes it |
| generic non-independent player/Visualizer | Chat uses generic player | not Radio dead code |

No missing cleanup was found for component-level PTT subscriptions, timers, MutationObserver, Web tracks, MediaPlayer, Visualizer, AudioTrack, AudioRecord, or foreground service. Backend active transmission memory remains process-local and depends on disconnect/end cleanup.
