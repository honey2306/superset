Placeholder while data loads. Compose several to sketch a row's shape.

```jsx
<div style={{ display: "flex", gap: 8 }}>
  <Skeleton width={20} height={20} radius="999px" />
  <div style={{ flex: 1 }}>
    <Skeleton height={12} />
    <Skeleton height={10} width="60%" style={{ marginTop: 6 }} />
  </div>
</div>
```

Never wrap real text in a Skeleton — pick between "empty state" (no data) and "skeleton" (data on the way), not both.
