Bounded scroll region. Themed thin scrollbar (matches app-wide style).

```jsx
<ScrollArea maxHeight={280}>
  {rows.map(r => <FileRow key={r.id} {...r} />)}
</ScrollArea>
```

Don't wrap the whole page in this — the app's outer html/body is already `overflow: hidden` and every panel picks its own scroll rules.
