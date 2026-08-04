<script lang="ts">
	import { WEBUI_BASE_URL } from '$lib/constants';

	interface Props {
		className?: string;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		src?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
	}

	let { className = 'size-8', src = `${WEBUI_BASE_URL}/static/favicon.png` }: Props = $props();
</script>

<img
	crossorigin="anonymous"
	src={src === ''
		? `${WEBUI_BASE_URL}/static/favicon.png`
		: src.startsWith(WEBUI_BASE_URL) ||
			  src.startsWith('https://www.gravatar.com/avatar/') ||
			  src.startsWith('data:') ||
			  src.startsWith('/')
			? src
			: `/user.png`}
	class=" {className} object-cover rounded-full -translate-y-[1px]"
	alt="profile"
	draggable="false"
/>
