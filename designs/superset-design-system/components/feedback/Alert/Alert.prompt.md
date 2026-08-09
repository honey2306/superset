Inline banner for a persistent condition (not for transient success — use Toast for that).

```jsx
<Alert tone="warning" title="Uncommitted changes">
  Switching branches will stash 4 files.
</Alert>
```

Tone comes from `--<tone>-tint` bg + `--<tone>` icon; body stays `--fg`.
