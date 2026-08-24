# AutoMate relay build

The AutoMate-hosted phone UI calls task `16739` through its private HTTP
`/run` endpoint. Keep the task token in the ignored file
`apps/web/.env.automate.local` using the task's WebSocket URL as the shared
configuration format:

```dotenv
VITE_AUTOMATE_RELAY_URL=wss://automate.corp.kuaishou.com/res/task/16739/ws?token=<task-token>
```

Build the WebApp bundle with:

```sh
bun run --filter @superset/web build:automate
```

The build writes the Vite intermediate files and the deployable
`apps/web/dist-automate/task.js`. Upload that single file as the source for
AutoMate task `16740` (`POST /api/task/16740/run`). It returns the compiled
page through `am.return({ command: "html", data: { html } })`; the platform
then writes that HTML into the WebApp document. CSS and the React module bundle
are inlined, so the task has no dependency on Vite assets being hosted at
`/webapp/16740/assets/`.

`dist-automate` is ignored because the task source includes the relay URL
provided at build time. The regular `bun run --filter @superset/web build`
remains the direct LAN/Tailscale build served by host-service under `/app`.

The desktop/Host side uses the same private task URL from the root `.env`:

```dotenv
AUTOMATE_RELAY_URL=wss://automate.corp.kuaishou.com/res/task/16739/ws?token=<task-token>
```

Both clients convert that value to
`https://automate.corp.kuaishou.com/res/task/16739/run` and send the token in
the `x-am-task-token` header. HTTP task execution is intentional: AutoMate's
WebSocket sandbox currently rejects the relay's asynchronous task entrypoint,
while `/run` supports the same Redis-backed mailbox operations reliably.

When that variable is absent, Host does not advertise an AutoMate mailbox and
the desktop pairing screen offers only direct access.
