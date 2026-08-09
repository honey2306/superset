Click-triggered menu. Same visual density as ContextMenu; use the same MenuHeading / MenuGroup / MenuSep / MenuItem primitives inside.

```jsx
<DropdownMenu trigger={<Button>Sort <Icon name="chevron" /></Button>}>
  <MenuItem iconName="sort" label="By name" />
  <MenuItem iconName="clock" label="By recent" />
  <MenuSep />
  <MenuItem iconName="max" label="Group by project" />
</DropdownMenu>
```

Right-click on a row → `ContextMenu`. Click a button → `DropdownMenu`. Don't mix.
