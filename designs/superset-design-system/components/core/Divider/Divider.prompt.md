Hairline rule between grouped list items.

```jsx
<div>
  <FileRow dir="src/" file="a.ts" status="M" />
  <Divider />
  <FileRow dir="src/" file="b.ts" status="A" />
</div>

<Divider label="Yesterday" />
```

Bare form is `1px` `--line`. With a `label`, the rule breaks around a small mono caption.
