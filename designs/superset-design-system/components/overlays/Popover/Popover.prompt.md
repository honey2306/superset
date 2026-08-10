Popover container. Compose with the header/group/row/sep/hint pieces.

```jsx
<Popover>
  <PopoverHeader placeholder="Jump to branch…" />
  <PopoverGroup label="本地分支" count={4} action={<button className="action"><Icon name="plus" /> 新建</button>} />
  <PopoverRow name="feat/kro-suite" current tag={<Tag dir="up">3</Tag>} />
  <PopoverRow name="main" focused tag={<Tag dir="down">12</Tag>} end="1w" />
  <PopoverSep />
  <PopoverGroup label="远程" count={2} />
  <PopoverRow iconName="cloud" name="feat/mcp-cursor-connector" end="origin" />
  <PopoverHint>右键任意分支查看操作</PopoverHint>
</Popover>
```

Position it absolutely under a `<Pill>` trigger. `current` colors the row with accent tint; `focused` is keyboard focus.
