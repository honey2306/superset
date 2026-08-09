const { DesignCanvas, DCSection, DCArtboard } = window;

function App() {
	return (
		<DesignCanvas>
			<DCSection
				id="v1-header"
				title="V1 页头优化 · 3 种"
				subtitle="都是同一个列表,只换页头。目标:标题不占宽、筛选/新建不拥挤、副本去掉"
			>
				<DCArtboard
					id="v1a"
					label="V1a · 单行紧凑(推荐)"
					width={AB_W}
					height={AB_H}
				>
					<V1_FixedList todos={TODOS} headerKind="a" />
				</DCArtboard>
				<DCArtboard
					id="v1b"
					label="V1b · 双层 + 搜索输入"
					width={AB_W}
					height={AB_H}
				>
					<V1_FixedList todos={TODOS} headerKind="b" />
				</DCArtboard>
				<DCArtboard
					id="v1c"
					label="V1c · 数字融入标题 + Chip 条"
					width={AB_W}
					height={AB_H}
				>
					<V1_FixedList todos={TODOS} headerKind="c" />
				</DCArtboard>
			</DCSection>

			<DCSection
				id="other-variants"
				title="其他方向(供参考)"
				subtitle="上次的 V2 / V3 / V4"
			>
				<DCArtboard id="v2" label="V2 · 时间轴" width={AB_W} height={AB_H}>
					<V2_Timeline todos={TODOS} />
				</DCArtboard>
				<DCArtboard id="v3" label="V3 · 卡片网格" width={AB_W} height={AB_H}>
					<V3_CardGrid todos={TODOS} />
				</DCArtboard>
				<DCArtboard id="v4" label="V4 · Hero + 双栏" width={AB_W} height={AB_H}>
					<V4_Hero todos={TODOS} />
				</DCArtboard>
			</DCSection>
		</DesignCanvas>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
