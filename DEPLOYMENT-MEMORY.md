# Production memory tuning

Checklist for keeping the NestJS services inside their Railway container
limits. The order matters: the first item is worth more than everything else
combined.

## 1. Cap the Node heap per service (highest impact)

Railway does not always expose the container's cgroup limit to Node, so V8
sizes its heap from the **host** machine's RAM and happily grows until the
platform OOM-kills the container. Everything then restarts, in-flight requests
die, and the logs show nothing useful.

Set this in Railway → service → Variables, for **every** service:

```
NODE_OPTIONS=--max-old-space-size=384 --max-semi-space-size=16
```

Rule of thumb: heap ≈ 70–75 % of the container's RAM, leaving room for the
native heap, the Postgres/Redis sockets and the gRPC buffers.

| Container RAM | `--max-old-space-size` |
| ------------- | ---------------------- |
| 512 MB        | 320–384                |
| 1 GB          | 700–768                |
| 2 GB          | 1400–1536              |

If a service starts throwing `JavaScript heap out of memory`, the cap is too
low for its real workload — raise it rather than removing it.

**Do not run with `--enable-source-maps`.** That flag keeps the entire source
map resident, which can add a few hundred MB to a webpack bundle of this size.
Keep the maps on disk for local symbolication and leave the flag off in
production.

## 2. What is already tightened in code

| Setting | Before | Now | Why |
| --- | --- | --- | --- |
| TypeORM `logging` | `true` in payment, customer, iotec | off unless `DB_LOGGING=true` | Every statement allocated a string and was shipped to Railway's log pipeline. |
| Postgres pool | default 10 per service | `DB_POOL_MAX` (default 5) | 8 services × 10 = 80 connections. Each backend costs the **database** ~5–10 MB. |
| `synchronize` | hardcoded `true` in payment, customer, property, iotec | `DB_SYNCHRONIZE !== 'false'` | Lets you turn schema introspection off without a code deploy. |
| `POST /api/upload/proxy` | unlimited body, buffered in heap | `UPLOAD_MAX_BYTES` (default 64 MB) | A single large video could push the gateway past its limit and take every API route with it. |
| ffmpeg transcode | all cores | `VIDEO_TRANSCODE_THREADS` (default 2) | x264 allocates per-thread frame buffers. |

Related knobs that already existed: `VIDEO_TRANSCODE_CONCURRENCY` (default 1)
and `VIDEO_TRANSCODE_MAX_BYTES` (default 300 MB).

## 3. The biggest remaining spike: transcoding inside the gateway

`VideoTranscodeService` shells out to ffmpeg from **inside the api-gateway
process**. A 1080p H.264 encode can use 300–600 MB of RSS on its own. Since the
gateway also serves every API route, one video upload can OOM the whole public
API.

In order of preference:

1. Give the gateway 1 GB and keep `VIDEO_TRANSCODE_CONCURRENCY=1`.
2. Move transcoding to its own Railway service (same image, only the transcode
   endpoints exposed) so a heavy encode cannot kill the API.
3. Lower `VIDEO_TRANSCODE_MAX_BYTES` and cap `VIDEO_TRANSCODE_THREADS=1` if the
   container stays at 512 MB.

## 4. Railway-side settings

- `NODE_ENV=production` at **runtime**, not only at build time.
- Run the compiled output (`node dist/apps/<app>/main.js`). Never run
  `nx serve` in production: watch mode keeps the whole webpack graph and dev
  server alive on top of the app.
- `NX_DAEMON=false` and `NX_CLOUD=false` for build steps — the daemon and
  remote-cache client are pure build-time memory that a one-shot build does not
  need.
- Keep build and run as separate steps (Nixpacks does this by default) so the
  compiler's peak does not count against the runtime container.

## 5. Checking the result

Compare RSS right after boot and under load:

```
railway logs --service <name>        # look for restarts / 137 exits
```

An exit code of `137` (SIGKILL) is the platform OOM killer — lower the heap cap
or the workload. A `JavaScript heap out of memory` stack trace is V8's own
limit — raise it.
