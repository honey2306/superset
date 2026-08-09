Rich hover preview. For plain labels use `Tooltip` (much shorter delay + no structured content).

```jsx
<HoverCard content={<PRPreview id={4213} />}>
  <a href={pr.url}>#{pr.number}</a>
</HoverCard>
```

Content should read at a glance — think "quick preview card", not "detail view". Longer detail belongs in a `Sheet`.
