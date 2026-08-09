Radio row — one of a set. Pair every `<Radio>` under a shared `name`.

```jsx
<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
  <Radio name="scope" value="all" defaultChecked>All branches</Radio>
  <Radio name="scope" value="mine">Only mine</Radio>
  <Radio name="scope" value="starred">Starred</Radio>
</div>
```

Visual sibling of `Checkbox` — use `Radio` for one-of-many, `Checkbox` for many-of-many.
