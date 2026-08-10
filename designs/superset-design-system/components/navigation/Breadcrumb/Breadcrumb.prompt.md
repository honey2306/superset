Path trail, mono. Chevron sits between segments.

```jsx
<Breadcrumb
  items={[
    { label: "superset", onClick: goHome },
    { label: "apps/desktop/src/renderer", onClick: goPkg },
    { label: "MainView.tsx" },
  ]}
/>
```

Last segment isn't clickable and reads full `--fg`; prior ones are muted.
