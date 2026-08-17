// nodePalette.ts — the curation-pipeline node palette.
//
// Extracted verbatim from PipelineCanvas.svelte during the xyflow migration so
// the canvas stays readable and the palette can be asserted on directly in
// tests. Content is unchanged: same order, same labels, same groups, same
// templates. This is the HARDCODED palette; self.curator's live stage catalog
// (`/curator/api/text/{category}/stages`) is a separate, later swap.
import {
		DOCUMENT_SPLITTER_TEMPLATE,
		DOCUMENT_JOINER_TEMPLATE,
		WORD_COUNT_FILTER_TEMPLATE,
		NON_ALPHA_NUMERIC_FILTER_TEMPLATE,
		URLS_FILTER_TEMPLATE,
		NUMBERS_FILTER_TEMPLATE,
		WHITESPACE_FILTER_TEMPLATE,
		BULLETS_FILTER_TEMPLATE,
		LONG_WORD_FILTER_TEMPLATE,
		BOILERPLATE_STRING_FILTER_TEMPLATE,
		BOILERPLATE_STRING_MODIFIER_TEMPLATE,
		QUOTATION_REMOVER_MODIFIER_TEMPLATE,
		MARKDOWN_REMOVER_MODIFIER_TEMPLATE,
		NEWLINE_NORMALIZER_MODIFIER_TEMPLATE,
		SLICER_MODIFIER_TEMPLATE,
		URL_REMOVER_MODIFIER_TEMPLATE,
		LINE_REMOVER_MODIFIER_TEMPLATE,
        UNICODE_REFORMATTER_MODIFIER_TEMPLATE,
		QUALITY_CLASSIFIER_TEMPLATE,
		DOMAIN_CLASSIFIER_TEMPLATE,
		MULTILINGUAL_DOMAIN_CLASSIFIER_TEMPLATE,
		CONTENT_TYPE_CLASSIFIER_TEMPLATE,
		FINEWEB_EDU_CLASSIFIER_TEMPLATE,
		FINEWEB_MIXTRAL_EDU_CLASSIFIER_TEMPLATE,
		FINEWEB_NEMOTRON_EDU_CLASSIFIER_TEMPLATE,
		PROMPT_TASK_COMPLEXITY_CLASSIFIER_TEMPLATE,
		EXACT_DEDUP_TEMPLATE,
		FUZZY_DEDUP_TEMPLATE,
		SYMBOLS_TO_WORDS_FILTER_TEMPLATE,
		PARENTHESES_FILTER_TEMPLATE,
		MEAN_WORD_LENGTH_FILTER_TEMPLATE,
		PUNCTUATION_FILTER_TEMPLATE,
		ELLIPSIS_FILTER_TEMPLATE,
		COMMON_ENGLISH_WORDS_FILTER_TEMPLATE,
		WORDS_WITHOUT_ALPHABETS_FILTER_TEMPLATE,
		PORNOGRAPHIC_URLS_FILTER_TEMPLATE,
		SUBSTRING_FILTER_TEMPLATE,
		REPEATED_LINES_FILTER_TEMPLATE,
		REPEATED_PARAGRAPHS_FILTER_TEMPLATE,
		REPEATED_LINES_BY_CHAR_FILTER_TEMPLATE,
		REPEATED_PARAGRAPHS_BY_CHAR_FILTER_TEMPLATE,
		REPEATING_TOP_NGRAMS_FILTER_TEMPLATE,
		REPEATING_DUPLICATE_NGRAMS_FILTER_TEMPLATE,
		PYTHON_COMMENT_TO_CODE_FILTER_TEMPLATE,
		GENERAL_COMMENT_TO_CODE_FILTER_TEMPLATE,
		NUMBER_OF_LINES_OF_CODE_FILTER_TEMPLATE,
		XML_HEADER_FILTER_TEMPLATE,
		ALPHA_FILTER_TEMPLATE,
		HTML_BOILERPLATE_FILTER_TEMPLATE,
		TOKENIZER_FERTILITY_FILTER_TEMPLATE,
		PER_EXTENSION_FILTER_TEMPLATE,
		FASTTEXT_QUALITY_FILTER_TEMPLATE,
		FASTTEXT_LANG_ID_TEMPLATE,
		FASTTEXT_LABEL_MODIFIER_TEMPLATE,
		HISTOGRAM_FILTER_TEMPLATE,
		TOKEN_COUNT_FILTER_TEMPLATE,
} from './nodeTemplate';
import type { NodeTemplate } from './nodeTemplate';

/** The three node kinds a pipeline graph can contain. Declared here rather than
 *  in the canvas so the palette, the canvas and the xyflow node component all
 *  agree on one definition. */
export type PipelineNodeKind = 'source' | 'sink' | 'transform';

export type PaletteEntry = {
		type: PipelineNodeKind;
		label: string;
		headerColor: string;
		description: string;
		template?: NodeTemplate;
		group?: string;
};

export const NODE_TYPES: PaletteEntry[] = [
		{ type: 'source', label: 'Source', headerColor: 'bg-emerald-600', description: 'File input / KB source' },
		{ type: 'sink', label: 'Output', headerColor: 'bg-indigo-600', description: 'Stage output sink' },
		{ type: 'transform', label: 'Document Splitter', headerColor: 'bg-rose-950', description: 'Split docs by separator', template: DOCUMENT_SPLITTER_TEMPLATE, group: 'Document Ops' },
		{ type: 'transform', label: 'Document Joiner', headerColor: 'bg-violet-600', description: 'Join documents', template: DOCUMENT_JOINER_TEMPLATE, group: 'Document Ops' },
		{ type: 'transform', label: 'Word Count Filter', headerColor: 'bg-amber-600', description: 'Filter by word count', template: WORD_COUNT_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Non-AlphaNumeric Filter', headerColor: 'bg-amber-600', description: 'Filter by non-alphanumeric ratio', template: NON_ALPHA_NUMERIC_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'URL Filter', headerColor: 'bg-amber-600', description: 'Filter by URL density', template: URLS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Numbers Filter', headerColor: 'bg-amber-600', description: 'Filter by numeric character ratio', template: NUMBERS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Whitespace Filter', headerColor: 'bg-amber-600', description: 'Filter by whitespace ratio', template: WHITESPACE_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Bullets Filter', headerColor: 'bg-amber-600', description: 'Filter by bullet line ratio', template: BULLETS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Long Word Filter', headerColor: 'bg-amber-600', description: 'Filter by max word length', template: LONG_WORD_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Boilerplate Filter', headerColor: 'bg-amber-600', description: 'Filter boilerplate strings', template: BOILERPLATE_STRING_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Symbols to Words Filter', headerColor: 'bg-amber-600', description: 'Filter by symbol-to-word ratio', template: SYMBOLS_TO_WORDS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Parentheses Filter', headerColor: 'bg-amber-600', description: 'Filter by parentheses ratio', template: PARENTHESES_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Mean Word Length Filter', headerColor: 'bg-amber-600', description: 'Filter by average word length', template: MEAN_WORD_LENGTH_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Punctuation Filter', headerColor: 'bg-amber-600', description: 'Filter by sentence end-punctuation rate', template: PUNCTUATION_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Ellipsis Filter', headerColor: 'bg-amber-600', description: 'Filter by ellipsis line ratio', template: ELLIPSIS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Common English Words Filter', headerColor: 'bg-amber-600', description: 'Filter by presence of common English words', template: COMMON_ENGLISH_WORDS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Words Without Alphabets Filter', headerColor: 'bg-amber-600', description: 'Filter by fraction of words with alphabetic chars', template: WORDS_WITHOUT_ALPHABETS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Pornographic URLs Filter', headerColor: 'bg-amber-600', description: 'Remove docs with adult content URLs', template: PORNOGRAPHIC_URLS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Substring Filter', headerColor: 'bg-amber-600', description: 'Keep docs containing a substring at a position', template: SUBSTRING_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Repeated Lines Filter', headerColor: 'bg-amber-600', description: 'Filter docs with many duplicate lines', template: REPEATED_LINES_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Repeated Paragraphs Filter', headerColor: 'bg-amber-600', description: 'Filter docs with many duplicate paragraphs', template: REPEATED_PARAGRAPHS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Repeated Lines by Char Filter', headerColor: 'bg-amber-600', description: 'Filter by repeated-line character ratio', template: REPEATED_LINES_BY_CHAR_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Repeated Paragraphs by Char Filter', headerColor: 'bg-amber-600', description: 'Filter by repeated-paragraph character ratio', template: REPEATED_PARAGRAPHS_BY_CHAR_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Repeating Top N-Grams Filter', headerColor: 'bg-amber-600', description: 'Filter docs dominated by top n-grams', template: REPEATING_TOP_NGRAMS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Repeating Duplicate N-Grams Filter', headerColor: 'bg-amber-600', description: 'Filter docs dominated by duplicate n-grams', template: REPEATING_DUPLICATE_NGRAMS_FILTER_TEMPLATE, group: 'Filters' },
		{ type: 'transform', label: 'Boilerplate Modifier', headerColor: 'bg-teal-600', description: 'Remove boilerplate strings', template: BOILERPLATE_STRING_MODIFIER_TEMPLATE, group: 'Modifiers' },
		{ type: 'transform', label: 'Remove Quotation Marks', headerColor: 'bg-teal-600', description: 'Strip surrounding quotes', template: QUOTATION_REMOVER_MODIFIER_TEMPLATE, group: 'Modifiers' },
		{ type: 'transform', label: 'Strip Markdown', headerColor: 'bg-teal-600', description: 'Remove markdown formatting', template: MARKDOWN_REMOVER_MODIFIER_TEMPLATE, group: 'Modifiers' },
		{ type: 'transform', label: 'Newline Normalizer', headerColor: 'bg-teal-600', description: 'Normalize excessive newlines', template: NEWLINE_NORMALIZER_MODIFIER_TEMPLATE, group: 'Modifiers' },
		{ type: 'transform', label: 'Slicer', headerColor: 'bg-teal-600', description: 'Slice document by character index', template: SLICER_MODIFIER_TEMPLATE, group: 'Modifiers' },
		{ type: 'transform', label: 'Remove URLs', headerColor: 'bg-teal-600', description: 'Strip all URLs from document', template: URL_REMOVER_MODIFIER_TEMPLATE, group: 'Modifiers' },
		{ type: 'transform', label: 'Line Remover', headerColor: 'bg-teal-600', description: 'Remove lines matching patterns', template: LINE_REMOVER_MODIFIER_TEMPLATE, group: 'Modifiers' },
		{ type: 'transform', label: 'Unicode Reformatter', headerColor: 'bg-teal-600', description: 'Make Everything Unicode Characters', template: UNICODE_REFORMATTER_MODIFIER_TEMPLATE, group: 'Modifiers' },
		{ type: 'transform', label: 'Quality Classifier', headerColor: 'bg-purple-600', description: 'Score documents by quality', template: QUALITY_CLASSIFIER_TEMPLATE, group: 'Classifiers' },
		{ type: 'transform', label: 'Domain Classifier', headerColor: 'bg-purple-600', description: 'Classify docs into content domains', template: DOMAIN_CLASSIFIER_TEMPLATE, group: 'Classifiers' },
		{ type: 'transform', label: 'Multilingual Domain Classifier', headerColor: 'bg-purple-600', description: 'Domain classifier (52 languages)', template: MULTILINGUAL_DOMAIN_CLASSIFIER_TEMPLATE, group: 'Classifiers' },
		{ type: 'transform', label: 'Content Type Classifier', headerColor: 'bg-purple-600', description: 'Classify into 11 speech/content types', template: CONTENT_TYPE_CLASSIFIER_TEMPLATE, group: 'Classifiers' },
		{ type: 'transform', label: 'FineWeb Edu Classifier', headerColor: 'bg-purple-600', description: 'Score educational content quality (0–5)', template: FINEWEB_EDU_CLASSIFIER_TEMPLATE, group: 'Classifiers' },
		{ type: 'transform', label: 'FineWeb Mixtral Edu Classifier', headerColor: 'bg-purple-600', description: 'Edu quality via Mixtral annotations', template: FINEWEB_MIXTRAL_EDU_CLASSIFIER_TEMPLATE, group: 'Classifiers' },
		{ type: 'transform', label: 'FineWeb Nemotron Edu Classifier', headerColor: 'bg-purple-600', description: 'Edu quality via Nemotron-4 annotations', template: FINEWEB_NEMOTRON_EDU_CLASSIFIER_TEMPLATE, group: 'Classifiers' },
		{ type: 'transform', label: 'Prompt Task & Complexity', headerColor: 'bg-purple-600', description: 'Score prompt complexity across 6 dimensions', template: PROMPT_TASK_COMPLEXITY_CLASSIFIER_TEMPLATE, group: 'Classifiers' },
		{ type: 'transform', label: 'Exact Dedup', headerColor: 'bg-cyan-700', description: 'Hash-based exact duplicate removal (GPU)', template: EXACT_DEDUP_TEMPLATE, group: 'Deduplication' },
		{ type: 'transform', label: 'Fuzzy Dedup', headerColor: 'bg-cyan-700', description: 'MinHash/LSH near-duplicate removal (GPU)', template: FUZZY_DEDUP_TEMPLATE, group: 'Deduplication' },
		{ type: 'transform', label: 'Python Comment/Code Ratio', headerColor: 'bg-violet-700', description: 'Filter Python files by comment-to-code ratio', template: PYTHON_COMMENT_TO_CODE_FILTER_TEMPLATE, group: 'Code Quality' },
		{ type: 'transform', label: 'Comment/Code Ratio', headerColor: 'bg-violet-700', description: 'Filter code files by comment ratio (any language)', template: GENERAL_COMMENT_TO_CODE_FILTER_TEMPLATE, group: 'Code Quality' },
		{ type: 'transform', label: 'Lines of Code', headerColor: 'bg-violet-700', description: 'Filter by number of lines of code', template: NUMBER_OF_LINES_OF_CODE_FILTER_TEMPLATE, group: 'Code Quality' },
		{ type: 'transform', label: 'XML Header', headerColor: 'bg-violet-700', description: 'Remove files with XML headers (wrong extension)', template: XML_HEADER_FILTER_TEMPLATE, group: 'Code Quality' },
		{ type: 'transform', label: 'Alpha Ratio', headerColor: 'bg-violet-700', description: 'Filter out files that are mostly non-alphabetic', template: ALPHA_FILTER_TEMPLATE, group: 'Code Quality' },
		{ type: 'transform', label: 'HTML Boilerplate', headerColor: 'bg-violet-700', description: 'Remove HTML files that are mostly boilerplate', template: HTML_BOILERPLATE_FILTER_TEMPLATE, group: 'Code Quality' },
		{ type: 'transform', label: 'Tokenizer Fertility', headerColor: 'bg-violet-700', description: 'Filter code by chars-per-token ratio (SentencePiece)', template: TOKENIZER_FERTILITY_FILTER_TEMPLATE, group: 'Code Quality' },
		{ type: 'transform', label: 'Per-Extension Filter', headerColor: 'bg-violet-700', description: 'Apply language/extension-specific code quality rules', template: PER_EXTENSION_FILTER_TEMPLATE, group: 'Code Quality' },
		{ type: 'transform', label: 'FastText Quality', headerColor: 'bg-orange-600', description: 'Quality filter using FastText model score', template: FASTTEXT_QUALITY_FILTER_TEMPLATE, group: 'FastText' },
		{ type: 'transform', label: 'FastText Language ID', headerColor: 'bg-orange-600', description: 'Filter documents by detected language', template: FASTTEXT_LANG_ID_TEMPLATE, group: 'FastText' },
		{ type: 'transform', label: 'FastText Label', headerColor: 'bg-orange-600', description: 'Prepend a FastText label prefix to each document', template: FASTTEXT_LABEL_MODIFIER_TEMPLATE, group: 'FastText' },
		{ type: 'transform', label: 'Histogram Filter', headerColor: 'bg-indigo-600', description: 'Filter by character coverage histogram (multi-language)', template: HISTOGRAM_FILTER_TEMPLATE, group: 'Language Filters' },
		{ type: 'transform', label: 'Token Count', headerColor: 'bg-indigo-600', description: 'Filter by tokenized length using a HF tokenizer', template: TOKEN_COUNT_FILTER_TEMPLATE, group: 'Language Filters' },
];

/** Palette groups in first-appearance order; ungrouped entries (Source/Output)
 *  are returned under a null group so the canvas can pin them at the top. */
export function paletteGroups(entries: PaletteEntry[] = NODE_TYPES) {
	const groups = new Map<string | null, PaletteEntry[]>();
	for (const entry of entries) {
		const key = entry.group ?? null;
		const bucket = groups.get(key);
		if (bucket) bucket.push(entry);
		else groups.set(key, [entry]);
	}
	return [...groups.entries()].map(([group, items]) => ({ group, items }));
}
