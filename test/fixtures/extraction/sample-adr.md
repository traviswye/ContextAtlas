---
id: ADR-07
title: Orders must be idempotent
status: accepted
symbols:
  - OrderProcessor
  - BaseProcessor
---

# ADR-07: Orders must be idempotent

All order processing must be safely retryable. The OrderProcessor class
implements idempotency via a dedupe key on inbound requests. Downstream
systems can therefore replay failed deliveries without duplication.

BaseProcessor provides the shared retry loop; OrderProcessor extends it.
