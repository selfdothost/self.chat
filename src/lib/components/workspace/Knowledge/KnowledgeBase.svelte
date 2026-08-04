<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import Fuse from 'fuse.js';
	import { toast } from 'svelte-sonner';
	import { v4 as uuidv4 } from 'uuid';

	import { onMount, getContext, onDestroy } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { config, showSidebar, knowledge as _knowledge } from '$lib/stores';

	import { updateFileDataContentById, uploadFile, getFileById } from '$lib/apis/files';
	import {
		addFileToKnowledgeById,
		getKnowledgeById,
		getKnowledgeBases,
		removeFileFromKnowledgeById,
		resetKnowledgeById,
		updateFileFromKnowledgeById,
		updateKnowledgeById,
		prepareKnowledgeInput
	} from '$lib/apis/knowledge';

	import { transcribeAudio } from '$lib/apis/audio';
	import { blobToFile } from '$lib/utils';
	import { processWeb, startWebCrawl, getWebCrawlStatus, cancelWebCrawl, listWebCrawlJobs, getRAGConfig } from '$lib/apis/retrieval';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import Files from './KnowledgeBase/Files.svelte';
	import AddFilesPlaceholder from '$lib/components/AddFilesPlaceholder.svelte';

	import SavePipelineModal from './KnowledgeBase/PipelineModal.svelte';
	import AddContentMenu from './KnowledgeBase/AddContentMenu.svelte';
	import AddTextContentModal from './KnowledgeBase/AddTextContentModal.svelte';
	import AddWebUrlModal from './KnowledgeBase/AddWebUrlModal.svelte';

	import SyncConfirmDialog from '../../common/ConfirmDialog.svelte';
	import ChevronLeft from '$lib/components/icons/ChevronLeft.svelte';
	import LockClosed from '$lib/components/icons/LockClosed.svelte';
	import AccessControlModal from '../common/AccessControlModal.svelte';
	import PipelineCanvas from './KnowledgeBase/PipelineCanvas.svelte';
	import DatasetView from './KnowledgeBase/DatasetView.svelte';
	import PipelineJobsPanel from './KnowledgeBase/PipelineJobsPanel.svelte';
	import FileViewModal from './KnowledgeBase/FileViewModal.svelte';
	import { queueCuratorJob } from '$lib/apis/curator';

	let activeTab: 'files' | 'pipeline' = $state('files');



	type Knowledge = {
		id: string;
		name: string;
		description: string;
		data: {
			file_ids: string[];
			hf_path?: string;
		};
		// curated: set by curator-output datasets (no hf_path) -- see DatasetView.svelte's
		// isCurated check, which reads this same field.
		meta?: { dataset?: boolean; hf_path?: string; curated?: boolean };
		// Same open-ended shape as AccessControl.svelte's prop -- read/write
		// group_ids bags, not a fixed structure.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		access_control?: Record<string, any> | null;
		// File item shape varies by upload path (direct upload, URL scrape,
		// Google Drive, ...) — accessed dynamically (item.itemId, item.id, item.meta?.name, ...)
		// rather than through one consistent interface.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		files: Record<string, any>[];
	};

	let id = $state(null);
	let knowledge: Knowledge | null = $state(null);
	let query = $state('');

	let showAddTextContentModal = $state(false);
	let showSyncConfirmModal = $state(false);
	let showAccessControlModal = $state(false);
	let showAddWebUrlModal = $state(false);
	let showAddWebCrawlModal = $state(false);
	let webLoaderEngine = $state('');
	let crawlLoading = $state(false);
	let crawlJobId: string | null = null;
	let crawlUrl = '';
	let crawlProgress: { completed: number; total: number; savedCount?: number } | null = $state(null);
	let crawlPollTimer: ReturnType<typeof setTimeout> | null = null;
	let crawlTempItemId: string | null = null;
	let lastProcessedPageIndex = 0;
	let crawlLogs: string[] = $state([]);

	let pipelineCreatedAt = null;
	let pipelineName = $state('Untitled');
	let showPipelineModal = $state(false);
	let pipelineNodes = $state([]);
	let pipelineConnections = $state([]);
	let pipelineModalMode: 'save' | 'load' = $state('save');
	let pendingRun = $state(false);



	let inputFiles = $state(null);

	let filteredItems = $state([]);


	let selectedFile = $state(null);
	let selectedFileId = $state(null);


	 
	// shape `knowledge.files` currently is, not a fixed item type.
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let fuse: Fuse<any> | undefined = $state();
	/* eslint-enable @typescript-eslint/no-explicit-any */
	let debounceTimeout = null;
	let dragged = $state(false);

	const createFileFromText = (name, content) => {
		const blob = new Blob([content], { type: 'text/plain' });
		const file = blobToFile(blob, `${name}.txt`);

		console.log(file);
		return file;
	};

	const createPipelineFile = (content) => {
		const blob = new Blob([content], { type: 'application/json'})
		const file = blobToFile(blob, `${pipelineName}_${knowledge.name}_pipeline.json`)

		console.log(file);
		return file;
	}; 

	const loadPipelineHandler = async (fileId) => {
		try {
			const loadedFile = await getFileById(localStorage.token, fileId);
		
			if (loadedFile) {
				console.log(loadedFile);
				const loadedContent = JSON.parse(loadedFile.data.content)
				pipelineName = loadedContent.name;
				pipelineCreatedAt = loadedContent.created_at;
				pipelineNodes = loadedContent.nodes;
				pipelineConnections = loadedContent.connections;
			} else {
				toast.error($i18n.t('Failed to load config'))
				return null;
			}
		} catch (error) {
			toast.error((error as Error)?.message ?? String(error));
		}
	}

	
	const savePipelineHandler = async () => {
		const existing = knowledge?.files.find(f => (f.name ?? f.meta?.name)?.endsWith(`${pipelineName}_${knowledge.name}_pipeline.json`))
		const now = new Date().toISOString();
		const createdAt = pipelineCreatedAt ?? now;
		const pipelineConfig = {
			created_at: createdAt,
			updated_at: now,
			name: pipelineName,
			nodes: pipelineNodes,
			connections: pipelineConnections
		};
		pipelineCreatedAt = createdAt
		if (existing) {
			await updateFileDataContentById(localStorage.token, existing.id, JSON.stringify(pipelineConfig))
			showPipelineModal = false;
			if (pendingRun) {
				pendingRun = false;
				scheduleHandler();
			}
			return;
		} else {
		const configFile = createPipelineFile(JSON.stringify(pipelineConfig));
		
		if (configFile.size == 0) {
			toast.error($i18n.t('You cannot save an empty pipeline'))
			return null;
		}
		try {
		const uploadedPipeline = await uploadFile(localStorage.token, configFile);

		if (uploadedPipeline) {
			console.log(uploadedPipeline);
			await addFileHandler(uploadedPipeline.id)
			showPipelineModal = false;
		} else {
			toast.error($i18n.t('Failed to save config'))
			showPipelineModal = false;
			return null;
		}

		}
		catch (e) {
			toast.error((e as Error)?.message ?? String(e));
			showPipelineModal = false;
		}

		if (pendingRun) {
			pendingRun = false;
			scheduleHandler();
		}
	};
	};

	const scheduleHandler = async () => {
		const source = pipelineNodes.find(n => n.type === 'source');
		const sink = pipelineNodes.find(n => n.type === 'sink');

		if (!knowledge) return;
		if (pipelineName === 'Untitled') {
			pendingRun = true;
			pipelineModalMode = 'save';
			showPipelineModal = true;
			return;
		}

		if (!source || !sink) {
			toast.error('Pipeline must have a Source and a Sink');
			return;
		}

		// Walk connections from source to sink in order
		const connMap = Object.fromEntries(pipelineConnections.map(c => [c.fromId, c.toId]));
		const stages = [];
		let currentId = source.id;

		while (connMap[currentId] && connMap[currentId] !== sink.id) {
			currentId = connMap[currentId];
			const node = pipelineNodes.find(n => n.id === currentId);
			if (!node || node.type !== 'transform' || !node.config?.stage_type) {
				toast.error(`Node "${node?.label ?? currentId}" is missing a stage type`);
				return;
			}
			const params = Object.fromEntries(
				Object.entries(node.config.params ?? {}).filter(([_, v]) => v !== null)
			);
			stages.push({ type: node.config.stage_type, params });
		}

		if (!connMap[source.id]) {
			toast.error('Source node is not connected');
			return;
		}

		const textField = source.config?.text_field || 'text';
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const outputPath = `/workspace/ui-data/uploads/${knowledge.id}/output/${pipelineName}`;

		let inputPath: string;
		let outputFormat: string;
		try {
			const prepared = await prepareKnowledgeInput(localStorage.token, knowledge.id);
			toast.info(`Prepared ${prepared.file_count} files for curation`);
			inputPath = prepared.input_path;
			outputFormat = prepared.output_format ?? 'jsonl';
		} catch (e) {
			toast.error(
				typeof e === 'string' ? e : ((e as { detail?: string })?.detail ?? 'Failed to prepare input')
			);
			return;
		}

		try {
			const job = await queueCuratorJob(localStorage.token, {
				pipeline_id: knowledge.id,
				pipeline_config: {
					name: `${pipelineName}-${timestamp}`,
					input_path: inputPath,
					output_path: outputPath,
					text_field: textField,
					output_format: outputFormat,
					stages,
				},
				dataset_name: (sink.config?.datasetName ?? '').trim() || knowledge.name,
			});
			toast.success(`Job queued: ${job.id}`);
		} catch (e) {
			toast.error(
				typeof e === 'string' ? e : ((e as { detail?: string })?.detail ?? 'Failed to queue job')
			);
		}
	};

	const uploadFileHandler = async (file) => {
		console.log(file);

		const tempItemId = uuidv4();
		const fileItem = {
			type: 'file',
			file: '',
			id: null,
			url: '',
			name: file.name,
			size: file.size,
			status: 'uploading',
			error: '',
			itemId: tempItemId
		};

		if (fileItem.size == 0) {
			toast.error($i18n.t('You cannot upload an empty file.'));
			return null;
		}

		knowledge.files = [...(knowledge.files ?? []), fileItem];

		// Check if the file is an audio file and transcribe/convert it to text file
		if (['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a'].includes(file['type'])) {
			const res = await transcribeAudio(localStorage.token, file).catch((error) => {
				toast.error(error);
				return null;
			});

			if (res) {
				console.log(res);
				const blob = new Blob([res.text], { type: 'text/plain' });
				file = blobToFile(blob, `${file.name}.txt`);
			}
		}

		try {
			const uploadedFile = await uploadFile(localStorage.token, file).catch((e) => {
				toast.error(e);
				return null;
			});

			if (uploadedFile) {
				console.log(uploadedFile);
				knowledge.files = knowledge.files.map((item) => {
					if (item.itemId === tempItemId) {
						item.id = uploadedFile.id;
					}

					// Remove temporary item id
					delete item.itemId;
					return item;
				});
				await addFileHandler(uploadedFile.id);
			} else {
				toast.error($i18n.t('Failed to upload file.'));
			}
		} catch (e) {
			toast.error((e as Error)?.message ?? String(e));
		}
	};

	const uploadDirectoryHandler = async () => {
		// Check if File System Access API is supported
		const isFileSystemAccessSupported = 'showDirectoryPicker' in window;

		try {
			if (isFileSystemAccessSupported) {
				// Modern browsers (Chrome, Edge) implementation
				await handleModernBrowserUpload();
			} else {
				// Firefox fallback
				await handleFirefoxUpload();
			}
		} catch (error) {
			handleUploadError(error);
		}
	};

	// Helper function to check if a path contains hidden folders
	const hasHiddenFolder = (path) => {
		return path.split('/').some((part) => part.startsWith('.'));
	};

	// Modern browsers implementation using File System Access API
	const handleModernBrowserUpload = async () => {
		const dirHandle = await window.showDirectoryPicker();
		let totalFiles = 0;
		let uploadedFiles = 0;

		// Function to update the UI with the progress
		const updateProgress = () => {
			const percentage = (uploadedFiles / totalFiles) * 100;
			toast.info(`Upload Progress: ${uploadedFiles}/${totalFiles} (${percentage.toFixed(2)}%)`);
		};

		// Recursive function to count all files excluding hidden ones
		async function countFiles(dirHandle) {
			for await (const entry of dirHandle.values()) {
				// Skip hidden files and directories
				if (entry.name.startsWith('.')) continue;

				if (entry.kind === 'file') {
					totalFiles++;
				} else if (entry.kind === 'directory') {
					// Only process non-hidden directories
					if (!entry.name.startsWith('.')) {
						await countFiles(entry);
					}
				}
			}
		}

		// Recursive function to process directories excluding hidden files and folders
		async function processDirectory(dirHandle, path = '') {
			for await (const entry of dirHandle.values()) {
				// Skip hidden files and directories
				if (entry.name.startsWith('.')) continue;

				const entryPath = path ? `${path}/${entry.name}` : entry.name;

				// Skip if the path contains any hidden folders
				if (hasHiddenFolder(entryPath)) continue;

				if (entry.kind === 'file') {
					const file = await entry.getFile();
					const fileWithPath = new File([file], entryPath, { type: file.type });

					await uploadFileHandler(fileWithPath);
					uploadedFiles++;
					updateProgress();
				} else if (entry.kind === 'directory') {
					// Only process non-hidden directories
					if (!entry.name.startsWith('.')) {
						await processDirectory(entry, entryPath);
					}
				}
			}
		}

		await countFiles(dirHandle);
		updateProgress();

		if (totalFiles > 0) {
			await processDirectory(dirHandle);
		} else {
			console.log('No files to upload.');
		}
	};

	const scrapeURLHandler = async () => {
		showAddWebUrlModal = true;
	};

	const submitScrapeURLHandler = async (url: string) => {
		console.log('[scrapeURL] Starting scrape for:', url);

		const tempItemId = uuidv4();
		const fileItem = {
			type: 'file',
			file: '',
			id: null,
			url: '',
			name: url,
			size: 0,
			status: 'uploading',
			error: '',
			itemId: tempItemId
		};

		knowledge.files = [...(knowledge.files ?? []), fileItem];
		console.log('[scrapeURL] Added placeholder to files list, tempItemId:', tempItemId);

		const res = await processWeb(localStorage.token, id, url).catch((e) => {
			console.error('[scrapeURL] processWeb failed:', e);
			toast.error(e);
			return null;
		});

		console.log('[scrapeURL] processWeb response:', res);

		if (res) {
			const content = res?.file?.data?.content ?? '';
			console.log('[scrapeURL] Extracted content length:', content.length, 'chars');

			const blob = new Blob([content], { type: 'text/plain' });
			const file = blobToFile(blob, `${url}.md`);
			console.log('[scrapeURL] Created file blob, uploading...');

			const uploadedFile = await uploadFile(localStorage.token, file).catch((e) => {
				console.error('[scrapeURL] uploadFile failed:', e);
				toast.error(e);
				return null;
			});

			console.log('[scrapeURL] uploadFile response:', uploadedFile);

			if (uploadedFile) {
				knowledge.files = knowledge.files.map((item) => {
					if (item.itemId === tempItemId) {
						item.id = uploadedFile.id;
					}
					delete item.itemId;
					return item;
				});
				console.log('[scrapeURL] Updated placeholder with file id:', uploadedFile.id, '— calling addFileHandler');
				await addFileHandler(uploadedFile.id);
			} else {
				console.warn('[scrapeURL] uploadFile returned null, removing placeholder');
				knowledge.files = knowledge.files.filter((item) => item.itemId !== tempItemId);
				toast.error($i18n.t('Failed to upload scraped content.'));
			}
		} else {
			console.warn('[scrapeURL] processWeb returned null, removing placeholder');
			knowledge.files = knowledge.files.filter((item) => item.itemId !== tempItemId);
		}
	};

// ── Crawl polling (top-level so onMount can resume it after a refresh) ──────
	const startPolling = () => {
		const pollCrawlStatus = async () => {
			if (!crawlJobId) return;

			const jobStatus = await getWebCrawlStatus(localStorage.token, crawlJobId).catch((e) => {
				console.error('[crawlURL] poll failed:', e);
				return null;
			});

			console.log('[crawlURL] poll:', jobStatus);
			if (!jobStatus) {
				crawlPollTimer = setTimeout(pollCrawlStatus, 2000);
				return;
			}

			crawlProgress = {
				completed: jobStatus.completed ?? 0,
				total: jobStatus.total ?? 0,
				savedCount: jobStatus.saved_count ?? 0
			};

			// Log newly arrived page titles (display only — backend handles embedding)
			const pages: Array<{ url: string; title: string }> = jobStatus.pages ?? [];
			const newPages = pages.slice(lastProcessedPageIndex);
			for (const page of newPages) {
				crawlLogs = [...crawlLogs, `↳ ${page.title?.trim() || page.url}`];
				lastProcessedPageIndex++;
			}

			if (jobStatus.status === 'completed') {
				crawlPollTimer = null;
				crawlLoading = false;
				const savedCount = jobStatus.saved_count ?? 0;
				crawlLogs = [...crawlLogs, `Done — ${savedCount} page(s) saved.`];
				showAddWebCrawlModal = false;
				// Refresh knowledge from the API since the backend added files directly
				const refreshed = await getKnowledgeById(localStorage.token, id).catch(() => null);
				if (refreshed) knowledge = refreshed;
				knowledge.files = (knowledge.files ?? []).filter((item) => item.itemId !== crawlTempItemId);
				crawlTempItemId = null;
				if (savedCount === 0) toast.warning($i18n.t('No pages were saved.'));
				localStorage.removeItem('activeCrawlJob');
			} else if (jobStatus.status === 'failed') {
				crawlPollTimer = null;
				crawlLoading = false;
				crawlLogs = [...crawlLogs, 'Crawl failed.'];
				showAddWebCrawlModal = false;
				knowledge.files = (knowledge.files ?? []).filter((item) => item.itemId !== crawlTempItemId);
				crawlTempItemId = null;
				toast.error($i18n.t('Crawl failed.'));
				localStorage.removeItem('activeCrawlJob');
			} else if (jobStatus.status === 'cancelled') {
				crawlPollTimer = null;
				crawlLoading = false;
				showAddWebCrawlModal = false;
				const refreshed = await getKnowledgeById(localStorage.token, id).catch(() => null);
				if (refreshed) knowledge = refreshed;
				knowledge.files = (knowledge.files ?? []).filter((item) => item.itemId !== crawlTempItemId);
				crawlTempItemId = null;
				localStorage.removeItem('activeCrawlJob');
				if (jobStatus.cancel_reason) {
					toast.warning(jobStatus.cancel_reason);
				}
			} else {
				crawlPollTimer = setTimeout(pollCrawlStatus, 2000);
			}
		};

		crawlPollTimer = setTimeout(pollCrawlStatus, 2000);
	};

	const submitCrawlURLHandler = async (url: string, limit: number = 10, maxDepth: number = 3, crawlDelay: number = 2, max403s: number = 5, includePaths: string[] = [], excludePaths: string[] = [], regexOnFullUrl: boolean = false, crawlEntireDomain: boolean = false, batchSize: number = 10) => {
		console.log('[crawlURL] Starting crawl for:', url, 'limit:', limit);
		crawlLoading = true;
		crawlProgress = null;
		crawlLogs = [];

		const tempItemId = uuidv4();
		crawlTempItemId = tempItemId;
		crawlUrl = url;
		knowledge.files = [
			...(knowledge.files ?? []),
			{
				type: 'file',
				file: '',
				id: null,
				url: '',
				name: url,
				size: 0,
				status: 'uploading',
				error: '',
				itemId: tempItemId
			}
		];
		console.log('[crawlURL] Added placeholder, tempItemId:', tempItemId);

		const startRes = await startWebCrawl(localStorage.token, id, url, limit, crawlDelay, maxDepth, max403s > 0 ? max403s : null, includePaths.length > 0 ? includePaths : null, excludePaths.length > 0 ? excludePaths : null, regexOnFullUrl || null, crawlEntireDomain || null, batchSize).catch((e) => {
			console.error('[crawlURL] startWebCrawl failed:', e);
			toast.error(e);
			return null;
		});

		if (!startRes) {
			crawlLoading = false;
			showAddWebCrawlModal = false;
			knowledge.files = knowledge.files.filter((item) => item.itemId !== tempItemId);
			crawlTempItemId = null;
			return;
		}

		crawlJobId = startRes.job_id;
		lastProcessedPageIndex = 0;
		crawlLogs = ['Crawl started…'];
		console.log('[crawlURL] Job started, job_id:', crawlJobId);

		localStorage.setItem('activeCrawlJob', JSON.stringify({
			jobId: crawlJobId, knowledgeId: id, url, tempItemId, lastProcessedPageIndex: 0
		}));

		startPolling();
	};


	const cancelCrawlHandler = async () => {
		console.log('[crawlURL] Cancelling job:', crawlJobId);

		if (crawlPollTimer) {
			clearTimeout(crawlPollTimer ?? undefined);
			crawlPollTimer = null;
		}

		if (crawlJobId) {
			await cancelWebCrawl(localStorage.token, crawlJobId).catch((e) =>
				console.error('[crawlURL] cancel request failed:', e)
			);
			crawlJobId = null;
		}

		crawlLoading = false;
		showAddWebCrawlModal = false;
		crawlProgress = null;

		if (crawlTempItemId) {
			knowledge.files = knowledge.files.filter((item) => item.itemId !== crawlTempItemId);
			crawlTempItemId = null;
		}

		localStorage.removeItem('activeCrawlJob');
		toast.info($i18n.t('Crawl cancelled.'));
	};

	// Firefox fallback implementation using traditional file input
	const handleFirefoxUpload = async () => {
		return new Promise<void>((resolve, reject) => {
			// Create hidden file input
			const input = document.createElement('input');
			input.type = 'file';
			input.webkitdirectory = true;
			// `directory` is a legacy Firefox-only alias for `webkitdirectory` with no
			// modern DOM typing -- keep it for older Firefox folder-picker support.
			(input as HTMLInputElement & { directory?: boolean }).directory = true;
			input.multiple = true;
			input.style.display = 'none';

			// Add input to DOM temporarily
			document.body.appendChild(input);

			input.onchange = async () => {
				try {
					const files = Array.from(input.files)
						// Filter out files from hidden folders
						.filter((file) => !hasHiddenFolder(file.webkitRelativePath));

					let totalFiles = files.length;
					let uploadedFiles = 0;

					// Function to update the UI with the progress
					const updateProgress = () => {
						const percentage = (uploadedFiles / totalFiles) * 100;
						toast.info(
							`Upload Progress: ${uploadedFiles}/${totalFiles} (${percentage.toFixed(2)}%)`
						);
					};

					updateProgress();

					// Process all files
					for (const file of files) {
						// Skip hidden files (additional check)
						if (!file.name.startsWith('.')) {
							const relativePath = file.webkitRelativePath || file.name;
							const fileWithPath = new File([file], relativePath, { type: file.type });

							await uploadFileHandler(fileWithPath);
							uploadedFiles++;
							updateProgress();
						}
					}

					// Clean up
					document.body.removeChild(input);
					resolve();
				} catch (error) {
					reject(error);
				}
			};

			input.onerror = (error) => {
				document.body.removeChild(input);
				reject(error);
			};

			// Trigger file picker
			input.click();
		});
	};

	// Error handler
	const handleUploadError = (error) => {
		if (error.name === 'AbortError') {
			toast.info('Directory selection was cancelled');
		} else {
			toast.error('Error accessing directory');
			console.error('Directory access error:', error);
		}
	};

	// Helper function to maintain file paths within zip
	const syncDirectoryHandler = async () => {
		if ((knowledge?.files ?? []).length > 0) {
			const res = await resetKnowledgeById(localStorage.token, id).catch((e) => {
				toast.error(e);
			});

			if (res) {
				knowledge = res;
				toast.success($i18n.t('Knowledge reset successfully.'));

				// Upload directory
				uploadDirectoryHandler();
			}
		} else {
			uploadDirectoryHandler();
		}
	};

	const addFileHandler = async (fileId) => {
		const updatedKnowledge = await addFileToKnowledgeById(localStorage.token, id, fileId).catch(
			(e) => {
				toast.error(e);
				return null;
			}
		);

		if (updatedKnowledge) {
			knowledge = updatedKnowledge;
			toast.success($i18n.t('File added successfully.'));
		} else {
			toast.error($i18n.t('Failed to add file.'));
			knowledge.files = knowledge.files.filter((file) => file.id !== fileId);
		}
	};

	const deleteFileHandler = async (fileId) => {
		const updatedKnowledge = await removeFileFromKnowledgeById(
			localStorage.token,
			id,
			fileId
		).catch((e) => {
			toast.error(e);
		});

		if (updatedKnowledge) {
			knowledge = updatedKnowledge;
			toast.success($i18n.t('File removed successfully.'));
		}
	};

	const updateFileContentHandler = async () => {
		const fileId = selectedFile.id;
		const content = selectedFile.data.content;

		const res = updateFileDataContentById(localStorage.token, fileId, content).catch((e) => {
			toast.error(e);
		});

		const updatedKnowledge = await updateFileFromKnowledgeById(
			localStorage.token,
			id,
			fileId
		).catch((e) => {
			toast.error(e);
		});

		if (res && updatedKnowledge) {
			knowledge = updatedKnowledge;
			toast.success($i18n.t('File content updated successfully.'));
		}
	};

	const changeDebounceHandler = () => {
		console.log('debounce');
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}

		debounceTimeout = setTimeout(async () => {
			if (knowledge.name.trim() === '' || knowledge.description.trim() === '') {
				toast.error($i18n.t('Please fill in all fields.'));
				return;
			}

			const res = await updateKnowledgeById(localStorage.token, id, {
				...knowledge,
				name: knowledge.name,
				description: knowledge.description,
				access_control: knowledge.access_control
			}).catch((e) => {
				toast.error(e);
			});

			if (res) {
				toast.success($i18n.t('Knowledge updated successfully'));
				_knowledge.set(await getKnowledgeBases(localStorage.token));
			}
		}, 1000);
	};

	const onDragOver = (e) => {
		e.preventDefault();

		// Check if a file is being draggedOver.
		if (e.dataTransfer?.types?.includes('Files')) {
			dragged = true;
		} else {
			dragged = false;
		}
	};

	const onDragLeave = () => {
		dragged = false;
	};

	const onDrop = async (e) => {
		e.preventDefault();
		dragged = false;

		if (e.dataTransfer?.types?.includes('Files')) {
			if (e.dataTransfer?.files) {
				const inputFiles = e.dataTransfer?.files;

				if (inputFiles && inputFiles.length > 0) {
					for (const file of inputFiles) {
						await uploadFileHandler(file);
					}
				} else {
					toast.error($i18n.t(`File not found.`));
				}
			}
		}
	};

	onMount(async () => {
		id = $page.params.id;

		const res = await getKnowledgeById(localStorage.token, id).catch((e) => {
			toast.error(e);
			return null;
		});

			const ragConfig = await getRAGConfig(localStorage.token).catch(() => null);
		if (ragConfig) {
			webLoaderEngine = ragConfig.web_loader_engine ?? '';
		}

		if (res) {
			knowledge = res;

			// Resume an active crawl job — check the server so any device can pick it up
			try {
				const activeJobs = await listWebCrawlJobs(localStorage.token, id, 'running').catch(() => null);
				const activeJob = activeJobs?.length ? activeJobs[0] : null;

				if (activeJob) {
					crawlJobId = activeJob.job_id;
					crawlUrl = activeJob.url;
					crawlTempItemId = uuidv4();
					lastProcessedPageIndex = 0;
					crawlLoading = true;
					showAddWebCrawlModal = true;
					crawlLogs = ['Reconnected to crawl…'];
					knowledge.files = [
						...(knowledge.files ?? []),
						{ type: 'file', file: '', id: null, url: '', name: crawlUrl,
						  size: 0, status: 'uploading', error: '', itemId: crawlTempItemId }
					];
					localStorage.setItem('activeCrawlJob', JSON.stringify({
						jobId: crawlJobId, knowledgeId: id, url: crawlUrl,
						tempItemId: crawlTempItemId, lastProcessedPageIndex: 0
					}));
					startPolling();
				} else {
					localStorage.removeItem('activeCrawlJob');
				}
			} catch {
				// Best-effort crawl-job resume on mount — if checking for an
				// active job fails, the page still loads normally without it.
			}
		} else {
			goto(resolve('/(app)/workspace/knowledge'));
		}

		const dropZone = document.querySelector('body');
		dropZone?.addEventListener('dragover', onDragOver);
		dropZone?.addEventListener('drop', onDrop);
		dropZone?.addEventListener('dragleave', onDragLeave);
	});

	onDestroy(() => {
		const dropZone = document.querySelector('body');
		dropZone?.removeEventListener('dragover', onDragOver);
		dropZone?.removeEventListener('drop', onDrop);
		dropZone?.removeEventListener('dragleave', onDragLeave);
	});
	// The curation pipeline canvas is backed by self.curator; hide it unless the
	// server reports curator is wired up. Falling back to the Files tab keeps a
	// curator-less deploy (e.g. the standalone alpha image) from landing on a
	// pipeline tab that has no backend.
	// Dataset KBs (added via Add Dataset) carry a HuggingFace path but hold no
	// uploaded files — the files/pipeline tabs would just show an empty uploader,
	// so render a dataset-specific view (HF description + format + row preview).
	let isDataset = $derived(knowledge?.meta?.dataset ?? false);
	let datasetHfPath = $derived(knowledge?.data?.hf_path ?? knowledge?.meta?.hf_path ?? '');
	let curatorEnabled = $derived($config?.features?.enable_curator ?? false);
	$effect(() => {
		if (!curatorEnabled && activeTab === 'pipeline') {
			activeTab = 'files';
		}
	});
	let pipelineConfigs = $derived((knowledge?.files ?? [])
		.filter(f => (f.name ?? f.meta?.name)?.endsWith(`_pipeline.json`))
		.map(f => {
			const raw = f.name ?? f.meta?.name ?? '';
			const base = raw.length > 37 && raw[36] === '-' ? raw.substring(37) : raw;
			const suffix = `_${knowledge.name}_pipeline.json`;
			return { id: f.id, name: base.endsWith(suffix) ? base.slice(0, -suffix.length) : base };
		}));
	$effect(() => {
		if (knowledge && knowledge.files) {
			fuse = new Fuse(knowledge.files, {
				keys: ['meta.name', 'meta.description']
			});
		}
	});
	$effect(() => {
		if (fuse) {
			filteredItems = query
				? fuse.search(query).map((e) => {
						return e.item;
					})
				: (knowledge?.files ?? []);
		}
	});
	$effect(() => {
		if (selectedFileId) {
			const file = (knowledge?.files ?? []).find((file) => file.id === selectedFileId);
			if (file) {
				file.data = file.data ?? { content: '' };
				selectedFile = file;
			} else {
				selectedFile = null;
			}
		} else {
			selectedFile = null;
		}
	});
</script>

{#if dragged}
	<div
		class="fixed {$showSidebar
			? 'left-0 md:left-[260px] md:w-[calc(100%-260px)]'
			: 'left-0'}  w-full h-full flex z-50 touch-none pointer-events-none"
		id="dropzone"
		role="region"
		aria-label="Drag and Drop Container"
	>
		<div class="absolute w-full h-full backdrop-blur bg-gray-800/40 flex justify-center">
			<div class="m-auto pt-64 flex flex-col justify-center">
				<div class="max-w-md">
					<AddFilesPlaceholder>
						<div class=" mt-2 text-center text-sm dark:text-gray-200 w-full">
							Drop any files here to add to my documents
						</div>
					</AddFilesPlaceholder>
				</div>
			</div>
		</div>
	</div>
{/if}

<SyncConfirmDialog
	bind:show={showSyncConfirmModal}
	message={$i18n.t(
		'This will reset the knowledge base and sync all files. Do you wish to continue?'
	)}
	onConfirm={() => {
		syncDirectoryHandler();
	}}
/>

<AddTextContentModal
	bind:show={showAddTextContentModal}
	onSubmit={(detail) => {
		const file = createFileFromText(detail.name, detail.content);
		uploadFileHandler(file);
	}}
/>

<AddWebUrlModal
	bind:show={showAddWebUrlModal}
	onSubmit={(detail) => {
		submitScrapeURLHandler(detail.url);
	}}
/>

<AddWebUrlModal
	bind:show={showAddWebCrawlModal}
	title="Crawl a website"
	loading={crawlLoading}
	viewOnly={!crawlLoading && crawlLogs.length > 0}
	managedClose={true}
	showLimitInput={true}
	showMaxDepthInput={true}
	showPollIntervalInput={true}
	showMax403Input={true}
	showIncludePathsInput={true}
	showExcludePathsInput={true}
	showRegexOnFullUrlInput={true}
	showCrawlEntireDomainInput={true}
	showBatchSizeInput={true}
	{crawlProgress}
	{crawlLogs}
	onSubmit={(detail) => {
		submitCrawlURLHandler(detail.url, detail.limit, detail.maxDepth, detail.crawlDelay, detail.max403s ?? 5, detail.includePaths, detail.excludePaths, detail.regexOnFullUrl, detail.crawlEntireDomain, detail.batchSize ?? 10);
	}}
	onCancel={() => {
		cancelCrawlHandler();
	}}
/>

<SavePipelineModal
	bind:show={showPipelineModal}
	title="Set the name of the pipeline"
	mode={pipelineModalMode}
	{pipelineConfigs}
	onConfirm={(detail) => {
		if (pipelineModalMode === 'load') {
			loadPipelineHandler(detail.fileId)
		} else if (pipelineModalMode === 'save'){
			pipelineName = detail.name;
			savePipelineHandler();
		}
	}}
/>


<input
	id="files-input"
	bind:files={inputFiles}
	type="file"
	multiple
	hidden
	onchange={async () => {
		if (inputFiles && inputFiles.length > 0) {
			for (const file of inputFiles) {
				await uploadFileHandler(file);
			}

			inputFiles = null;
			const fileInputElement = document.getElementById('files-input') as HTMLInputElement | null;

			if (fileInputElement) {
				fileInputElement.value = '';
			}
		} else {
			toast.error($i18n.t(`File not found.`));
		}
	}}
/>

<div class="flex flex-col w-full translate-y-1" id="collection-container">
	{#if id && knowledge}
		<AccessControlModal
			bind:show={showAccessControlModal}
			bind:accessControl={knowledge.access_control}
			onChange={() => {
				changeDebounceHandler();
			}}
		/>
		<div class="w-full mb-2.5">
			<div class=" flex w-full">
				<div class="flex-1">
					<div class="flex items-center justify-between w-full px-0.5 mb-1">
						<div class="w-full">
							<input
								type="text"
								class="text-left w-full font-semibold text-2xl font-primary bg-transparent outline-hidden"
								bind:value={knowledge.name}
								placeholder="Knowledge Name"
								oninput={() => {
									changeDebounceHandler();
								}}
							/>
						</div>

						<div class="self-center shrink-0">
							<button
								class="bg-gray-50 hover:bg-gray-100 text-black dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-white transition px-2 py-1 rounded-full flex gap-1 items-center"
								type="button"
								onclick={() => {
									showAccessControlModal = true;
								}}
							>
								<LockClosed strokeWidth="2.5" className="size-3.5" />

								<div class="text-sm font-medium shrink-0">
									{$i18n.t('Access')}
								</div>
							</button>
						</div>
					</div>

					<div class="flex w-full px-1">
						<input
							type="text"
							class="text-left text-xs w-full text-gray-500 bg-transparent outline-hidden"
							bind:value={knowledge.description}
							placeholder="Knowledge Description"
							oninput={() => {
								changeDebounceHandler();
							}}
						/>
					</div>
				</div>
			</div>

			{#if !isDataset}
			<div class="flex items-center gap-1 px-1 mt-1 relative">
				{#if activeTab === 'files' && selectedFile}
				<button
					class="px-3 py-1 text-sm font-medium rounded-lg flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850 transition"
					onclick={() => {
						selectedFileId = null;
					}}
				>
					<ChevronLeft strokeWidth="2.5" className="size-3" />
					{$i18n.t('Back to Files')}
				</button>
				<span class="absolute left-1/2 -translate-x-1/2 text-xs font-medium text-gray-500 dark:text-gray-400 pointer-events-none line-clamp-1 max-w-[50%]">
					{selectedFile?.meta?.name}
				</span>
				<div class="ml-auto flex items-center gap-1">
					<button
						class="bg-gray-50 hover:bg-gray-100 text-black dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-white transition px-2 py-1 rounded-full flex gap-1 items-center"
						onclick={() => {
							updateFileContentHandler();
						}}
					>
						{$i18n.t('Save')}
					</button>
				</div>
				{:else}
				<button
					class="px-3 py-1 text-sm font-medium rounded-lg transition {activeTab === 'files'
						? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
						: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850'}"
					onclick={() => {
						activeTab = 'files';
					}}
				>
					{$i18n.t('Files')}
				</button>
				{#if curatorEnabled}
				<button
					class="px-3 py-1 text-sm font-medium rounded-lg transition {activeTab === 'pipeline'
						? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
						: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850'}"
					onclick={() => {
						activeTab = 'pipeline';
					}}
				>
					{$i18n.t('Pipeline')}
				</button>
				{/if}
				{/if}
				{#if activeTab === 'pipeline'}
				<span class="absolute left-1/2 -translate-x-1/2 text-xs font-medium text-gray-500 dark:text-gray-400 pointer-events-none">
					{pipelineName}
				</span>
				<div class="ml-auto flex items-center gap-1">
					<button
						class="bg-gray-50 hover:bg-gray-100 text-black dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-white transition px-2 py-1 rounded-full flex gap-1 items-center"
						onclick={() => {
							pipelineModalMode = 'load'
							showPipelineModal = true;
						}}
					>
						{$i18n.t('Load')}
					</button>
					<button
						class="bg-gray-50 hover:bg-gray-100 text-black dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-white transition px-2 py-1 rounded-full flex gap-1 items-center"
						onclick={() => {
							if (pipelineName !== 'Untitled') {
								savePipelineHandler();
							} else {
								pendingRun = false;
								pipelineModalMode = 'save';
								showPipelineModal = true;
							}
						}}
					>
						{$i18n.t('Save')}
					</button>
					<button
						class="bg-violet-600 hover:bg-violet-700 text-white transition px-2 py-1 rounded-full flex gap-1 items-center"
						onclick={scheduleHandler}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-3">
							<path fill-rule="evenodd" d="M4 1.75a.75.75 0 0 1 1.5 0V3h5V1.75a.75.75 0 0 1 1.5 0V3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2V1.75ZM4.5 7a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7Zm0 2.5a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1h-4Z" clip-rule="evenodd" />
						</svg>
						<span class="text-xs">
							{$i18n.t('Queue')}
						</span>
					</button>
				</div>
				{/if}
			</div>
			{/if}
		</div>

		{#if isDataset}
		<div class="flex-1 h-full max-h-full overflow-hidden pb-2.5">
			<DatasetView knowledge={knowledge} hfPath={datasetHfPath} />
		</div>
		{:else if activeTab === 'files'}
		<div class="flex flex-col flex-1 h-full max-h-full pb-2.5 gap-2">
			{#if selectedFile}
				<FileViewModal file={selectedFile} />
			{:else}
				<div class="px-1">
					<div class="flex mb-0.5">
						<div class=" self-center ml-1 mr-3">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="w-4 h-4"
							>
								<path
									fill-rule="evenodd"
									d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
						<input
							class=" w-full text-sm pr-4 py-1 rounded-r-xl outline-hidden bg-transparent"
							bind:value={query}
							placeholder={$i18n.t('Search Collection')}
						/>

						<div>
							<AddContentMenu
								{webLoaderEngine}
								onUpload={(detail) => {
									if (detail.type === 'directory') {
										uploadDirectoryHandler();
									} else if (detail.type === 'text') {
										showAddTextContentModal = true;
									} else if (detail.type === 'scrape'){
										scrapeURLHandler();
									} else if (detail.type === 'crawl') {
										crawlLogs = [];
										crawlProgress = null;
										showAddWebCrawlModal = true;
									} else {
										document.getElementById('files-input').click();
									}
								}}
								onSync={() => {
									showSyncConfirmModal = true;
								}}
							/>
						</div>
					</div>
				</div>

				<div class="px-2 py-1 text-xs text-gray-500">
					{(knowledge?.files ?? []).length} {(knowledge?.files ?? []).length === 1 ? $i18n.t('document') : $i18n.t('documents')}
					{#if query && filteredItems.length !== (knowledge?.files ?? []).length}
						<span>({filteredItems.length} {$i18n.t('matching')})</span>
					{/if}
				</div>

				{#if filteredItems.length > 0}
					<div class="flex-1 w-full h-full max-h-full overflow-y-auto scrollbar-hidden rounded-2xl border border-gray-50 dark:border-gray-850">
						<Files
							files={filteredItems}
							onOpen={(detail) => {
								if (detail === null && crawlLogs.length > 0) {
									showAddWebCrawlModal = true;
								} else {
									selectedFileId = detail;
								}
							}}
							onDelete={(detail) => {
								selectedFileId = null;
								deleteFileHandler(detail);
							}}
						/>
					</div>
				{:else}
					<div class="my-3 flex flex-col justify-center text-center text-gray-500 text-xs">
						<div>
							{$i18n.t('No content found')}
						</div>
					</div>
				{/if}
			{/if}
		</div>
		{:else if activeTab === 'pipeline'}
		<div style="height: calc(100vh - 270px);">
			<PipelineCanvas nodes={pipelineNodes} connections={pipelineConnections} on:configchange={(e) => { pipelineNodes = e.detail.nodes; pipelineConnections = e.detail.connections; }}/>
		</div>
		<PipelineJobsPanel pipelineName={pipelineName} token={localStorage.token} />
		{/if}
	{:else}
		<Spinner />
	{/if}
</div>
