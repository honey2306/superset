Section tabs.

```jsx
<Tabs
  value={tab}
  onChange={setTab}
  items={[
    { value: "Changes", label: "Changes", iconName: "changes" },
    { value: "Files", label: "Files", iconName: "file" },
  ]}
  trailing={<><IconButton title="Max"><Icon name="max"/></IconButton><IconButton title="Close"><Icon name="x"/></IconButton></>}
/>
```
