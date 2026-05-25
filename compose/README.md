# Docker Compose patterns

Ready-to-run Compose recipes that wire one of the cookbook's sample apps to common dependencies. All files target **Compose v2+** — the obsolete `version:` key is intentionally omitted everywhere.

| File | What you get | Use case |
|------|--------------|----------|
| [`docker-compose.app-postgres.yml`](./docker-compose.app-postgres.yml) | Node sample + Postgres + healthcheck-gated startup | Backend app with a database |
| [`docker-compose.app-redis.yml`](./docker-compose.app-redis.yml) | Python sample + Redis cache | Service + cache |
| [`docker-compose.reverse-proxy.yml`](./docker-compose.reverse-proxy.yml) | Caddy in front of Node + automatic HTTPS via local CA | Edge proxy in front of an app |
| [`docker-compose.observability.yml`](./docker-compose.observability.yml) | App + OpenTelemetry Collector + Prometheus + Grafana + Tempo | Local tracing/metrics stack |
| [`docker-compose.full-stack.yml`](./docker-compose.full-stack.yml) | All of the above in one network | End-to-end local demo |

## Common patterns shown

1. **Healthcheck-gated `depends_on`** so the app only starts after Postgres is actually ready (the default `service_started` is not enough).
2. **Named volumes for data**, **bind mounts for config** — never the other way around.
3. **`tmpfs` for `/tmp`** combined with `read_only: true` to harden the runtime.
4. **Resource limits** under `deploy:` so containers are killable on OOM, even on single-host Compose.
5. **`networks:` segmentation** — public-facing services on one network, internal-only services on another.

Each file is self-contained: copy it next to your code, point the build context, and `docker compose -f compose/docker-compose.app-postgres.yml up`.
