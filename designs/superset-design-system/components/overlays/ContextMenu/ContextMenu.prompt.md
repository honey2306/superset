Right-click context menu. Compose with heading / group / sep / item.

```jsx
<ContextMenu style={{ position: "fixed", left: x, top: y }}>
  <MenuHeading title="feat/browser-use" />
  <MenuSep />
  <MenuGroup>分支操作</MenuGroup>
  <MenuItem iconName="arrowRight" label="切换到此分支" onClick={switchTo} />
  <MenuItem iconName="merge" label="合并到 当前分支" onClick={merge} />
  <MenuGroup>同步</MenuGroup>
  <MenuItem iconName="pull" label="拉取" tag={<Tag dir="down">2</Tag>} onClick={pull} />
  <MenuItem iconName="push" label="推送" tag={<Tag dir="up">3</Tag>} onClick={push} />
  <MenuSep />
  <MenuItem iconName="trash" label="删除分支" danger onClick={confirmDelete} />
</ContextMenu>
```

Disabled items: pass `disabled` and a `title` so the reason surfaces on hover ("已在此分支", "无法删除当前分支").
