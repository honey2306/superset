Indeterminate ring spinner.

```jsx
<Button variant="primary" disabled>
  <Spinner size={12} tone="accent" /> Pushing…
</Button>

<Spinner /> {/* 14px muted ring */}
```

Rotates at 900ms, collapses to a static ring under `prefers-reduced-motion`.
Row-level running state stays on `<WorkspaceItem state="running" />`'s dot — don't spinner-ify rows.
