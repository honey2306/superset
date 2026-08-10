Inline confirm card (positioned near the trigger, not a full modal).

```jsx
<ConfirmCard
  danger
  title="删除分支"
  body={<>这会从本地永久删除 <code>bugfix/xxx</code>。</>}
  confirmLabel="删除"
  onConfirm={doDelete}
  onCancel={close}
/>
```

Wire Enter/Esc in the parent.
