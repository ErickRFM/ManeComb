# Communication Service Architecture

## Overview

Independent communication platform extracted from ManeComb. Supports multiple providers,
queues, workers, templates, and history.

## Structure

```
src/
  index.js          - Main entry point
  core/             - Types, validators, retry logic
  providers/        - Email providers (Resend, SMTP, SES, etc.)
  queue/            - BullMQ / in-memory queue
  workers/          - Email & WhatsApp workers
  templates/        - HTML email templates
  renderer/         - Template rendering engine
  events/           - Socket.IO events
  history/          - MongoDB / in-memory history
  metrics/          - Unified metrics (counters, timers, gauges)
  config/           - Configuration management
  logger/           - Structured logging
  health/           - Health checks
  shared/           - Shared utilities
tests/
docs/
```

## Key Design Decisions

1. **Provider Pattern**: Strategy pattern for email providers, factory for instantiation
2. **Unified Queue**: Single queue module combining communication.queue.js and src/services/queue.js
3. **Unified Metrics**: Single metrics module combining both implementations
4. **Adapter Layer**: backend/modules/communication/ delegates to this service
5. **Graceful Degradation**: MongoDB fallback to in-memory, BullMQ fallback to local queue
6. **Error-Safe Providers**: All providers return structured `{ success, error }` objects
