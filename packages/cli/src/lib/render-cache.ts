/** Small LRU for completed message layouts; bounded even with large transcripts. */
export class RenderCache {
	private readonly entries = new Map<string, readonly string[]>();
	private size = 0;

	constructor(private readonly maxCharacters = 1_000_000) {}

	get(key: string, render: () => readonly string[]): readonly string[] {
		const existing = this.entries.get(key);
		if (existing) {
			this.entries.delete(key);
			this.entries.set(key, existing);
			return existing;
		}
		const lines = render();
		const cost = key.length + lines.reduce((sum, line) => sum + line.length, 0);
		if (cost > this.maxCharacters) return lines;
		while (
			this.entries.size &&
			(this.size + cost > this.maxCharacters || this.entries.size >= 128)
		) {
			const oldest = this.entries.entries().next().value;
			if (!oldest) break;
			this.entries.delete(oldest[0]);
			this.size -=
				oldest[0].length +
				oldest[1].reduce((sum, line) => sum + line.length, 0);
		}
		this.entries.set(key, lines);
		this.size += cost;
		return lines;
	}
}
