Side-anchored slide-in panel.

```jsx
<Sheet open={open} side="right" title="PR #4213" onClose={close}>
  <PRDetail />
</Sheet>
```

Use for detail views that need vertical room but shouldn't yank focus from the main area. For centered modal use `Dialog`; for row-anchored menus use `Popover`.
