Full-modal destructive confirm. Only when the trigger can't be anchored (bulk actions, sign-out, uninstall).

```jsx
<AlertDialog open={open} title="Delete 4 workspaces?" body="Their branches will remain on origin." confirmLabel="Delete 4" onConfirm={commit} onCancel={close} />
```

If you can anchor the confirm at the button or row, use `ConfirmCard` instead — it's less disruptive.
