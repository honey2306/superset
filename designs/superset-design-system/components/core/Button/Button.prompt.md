Pill-shaped button.

```jsx
<Button variant="primary"><Icon name="push" /> Commit</Button>
<Button>Cancel</Button>
<Button variant="ghost">Skip</Button>
<Button variant="danger"><Icon name="trash" /> Delete</Button>
<Button size="sm">Reset</Button>
```

Never use `primary` for destructive; use `danger`. Never pair `danger` + `disabled` without a reason — user reads it as a wall.
