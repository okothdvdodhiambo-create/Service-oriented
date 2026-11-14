# Report notes: SOA reusability and consistency

The verification service exposes a versioned REST contract through the gateway. The public web experience and a separately packaged Employer HR client consume the same endpoints; a mobile PWA or another authorized client can integrate without importing UI or service implementation code. The API key/JWT policies, response mapping, and verification log belong to the service boundary rather than any one frontend.

Lookups use a bounded in-memory cache with a 30-second TTL. Status-change events invalidate entries immediately when event delivery is available, reducing staleness without coupling the web or employer client to the registry database. If the event path is unavailable, a cached result can remain stale for at most the TTL. Registry timeouts return `503`, not `NOT_FOUND`, so infrastructure failure cannot be confused with a negative document result.

This design trades strong distributed-cache consistency for lower latency and simpler local operation. Multi-replica deployments should use a shared cache/event bus and distributed rate limiting; this baseline's cache and rate limiter are per process.
