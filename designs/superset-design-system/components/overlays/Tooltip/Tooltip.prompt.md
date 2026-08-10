Short label on hover / focus. Wraps exactly one interactive child.

```jsx
<Tooltip label="无法合并到自身" side="top">
  <IconButton disabled><Icon name="merge" /></IconButton>
</Tooltip>
```

Only for terse, factual labels. For anything longer than a phrase, use a Popover.
Explanations for disabled items belong here, never inline in the row.
