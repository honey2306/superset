Range slider. Used for compact numeric input where a spinner would clutter (audio gain, opacity, delay).

```jsx
<Slider defaultValue={12} min={0} max={30} onChange={setDelay} />
```

Never use for filter chips or category selection — use `SegmentedControl` for those.
