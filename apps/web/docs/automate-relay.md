# AutoMate relay build

The phone UI is served by AutoMate WebApp task `16740`. It never receives the
task credential for relay task `16739`.

The browser sends mailbox operations to the same-origin AutoMate endpoint:

```text
POST /api/task/16740/run
{ "type": "api", "relay": { "op": "pull", "mailboxId": "..." } }
```

Task `16740` must keep this server-side branch before its HTML branch:

```js
if (wire.type === "api" && wire.relay) {
  const invocation = await am.runTask(16739, wire.relay);
  // AutoMate wraps cross-task results in { status, error, result, logs, ... }.
  // Return only result; never expose invocation logs/session metadata to phone.
  am.return(invocation.result);
} else {
  // return the WebApp HTML
}
```

The task runtime invokes `16739` without sending its credential to the browser.
The generated browser bundle contains the fixed same-origin endpoint only; it
contains no task-16739 WebSocket URL, `x-am-task-token` header, or
`/res/task/16739/` URL. The server branch strips AutoMate's cross-task
invocation wrapper so its internal logs and session metadata cannot be returned
to the phone.

Build and verify the WebApp task source with:

```sh
bun run --filter @superset/web build:automate
bun run --filter @superset/web verify:build-output
```

The build writes the deployable `apps/web/dist-automate/task.js`. Upload that
single file as the source for AutoMate task `16740`. The task still returns
the compiled HTML through `am.return({ command: "html", data: { html } })` for
normal WebApp requests. CSS and the React module bundle are inlined, so the
task has no dependency on Vite assets being hosted at
`/webapp/16740/assets/`.

The desktop/Host side remains separate. It keeps the private task URL in the
root `.env` and sends the task credential from Electron main/host-service only:

```dotenv
AUTOMATE_RELAY_URL=wss://automate.corp.kuaishou.com/res/task/16739/ws?token=<task-token>
```

Host converts that value to the private `/run` endpoint and sends the token in
the `x-am-task-token` header. The phone does not receive this value. The
existing AutoMate mailbox push/pull/ack fallback remains in place; this change
only moves the phone-to-16739 invocation behind task `16740`.

Do not set `VITE_AUTOMATE_RELAY_URL` for the AutoMate WebApp build. The Vite
config rejects it so a token cannot be accidentally compiled into phone
JavaScript. No Superset public Gateway, Tailscale, or Cloudflare Tunnel is
required.
