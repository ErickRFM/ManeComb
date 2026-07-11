# Channel State Report

## Owner

The only writable selected channel is `activeConversationId` in the global Store. Radio selects it through `setActiveConversationId`; `activeChannel` is a read-only lookup in the Store conversation collection.

Removed producer: local `activeChannelId` and its synchronization effects.

## Consumers

- History loading: `loadConversation(activeConversationId)`.
- Dedicated PTT connection: `RadioRealtimeService.connect(token, activeChannel.id)`.
- Filters and render: `activeChannel` derived from the same id.
- Channel changes: directory/general/direct handlers write the Store id.

## Authorization

Transport connection is not sufficient. The service emits `radio:join` with an ACK timeout and reports:

```text
connecting -> join_sent -> ready
                        -> unauthorized
                        -> error
```

The join generation and channel id are checked before applying an ACK, preventing an old channel ACK from authorizing a newer selection.
