<script lang="ts">
	interface Props {
		percent?: number;
		label?: string;
		size?: number;
		strokeWidth?: number;
	}

	let {
		percent = 0,
		label = '',
		size = 160,
		strokeWidth = 12
	}: Props = $props();

	let clampedPercent = $derived(Math.min(100, Math.max(0, percent)));

	// Arc geometry: semicircle from left to right
	let r = $derived((size - strokeWidth) / 2);
	let cx = $derived(size / 2);
	let cy = $derived(size / 2);

	// SVG arc path (semicircle, left to right)
	let arcPath = $derived(`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`);

	// stroke-dasharray/offset for fill
	let arcLength = $derived(Math.PI * r);
	let dashOffset = $derived(arcLength * (1 - clampedPercent / 100));

	// Color based on percentage
	let color =
		$derived(clampedPercent >= 85
			? '#ef4444' // red-500
			: clampedPercent >= 60
				? '#eab308' // yellow-500
				: '#22c55e'); // green-500
</script>

<div class="flex flex-col items-center">
	<svg
		width={size}
		height={size / 2 + strokeWidth}
		viewBox="0 0 {size} {size / 2 + strokeWidth}"
		class="overflow-visible"
	>
		<!-- Background arc -->
		<path
			d={arcPath}
			fill="none"
			stroke="currentColor"
			stroke-width={strokeWidth}
			stroke-linecap="round"
			class="text-gray-200 dark:text-gray-700"
		/>

		<!-- Foreground arc (filled portion) -->
		<path
			d={arcPath}
			fill="none"
			stroke={color}
			stroke-width={strokeWidth}
			stroke-linecap="round"
			stroke-dasharray={arcLength}
			stroke-dashoffset={dashOffset}
			class="transition-all duration-700 ease-out"
		/>

		<!-- Percentage text -->
		<text
			x={cx}
			y={cy - 8}
			text-anchor="middle"
			dominant-baseline="auto"
			class="fill-current text-gray-900 dark:text-gray-100"
			font-size={size * 0.18}
			font-weight="600"
		>
			{Math.round(clampedPercent)}%
		</text>

		<!-- Label text -->
		{#if label}
			<text
				x={cx}
				y={cy + size * 0.08}
				text-anchor="middle"
				dominant-baseline="auto"
				class="fill-current text-gray-500 dark:text-gray-400"
				font-size={size * 0.09}
			>
				{label}
			</text>
		{/if}
	</svg>
</div>
