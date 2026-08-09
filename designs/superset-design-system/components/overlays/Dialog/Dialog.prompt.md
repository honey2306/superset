Full modal dialog.

```jsx
<Dialog open={open} onClose={close} width={560}>
  <DialogHeader title="New workspace" onClose={close} />
  <div style={{ padding: 20 }}>…form fields…</div>
  <DialogFooter>
    <Button onClick={close}>Cancel</Button>
    <Button variant="primary" onClick={create}>Create</Button>
  </DialogFooter>
</Dialog>
```

Never use `Dialog` for one-question confirms — pick `ConfirmCard` (anchored at the trigger).
