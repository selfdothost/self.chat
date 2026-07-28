import { describe, it, expect } from 'vitest';
import { sanitizeHref } from './index';

// self.chat#27: marked hands `token.href` straight through into `<a href>` with
// no scheme check, so a markdown link like `[click me](javascript:alert(1))`
// rendered a live, clickable javascript: URI in the chat transcript.

describe('sanitizeHref', () => {
	it('blocks a plain javascript: URI', () => {
		expect(sanitizeHref('javascript:alert(1)')).toBe('#');
	});

	it('blocks javascript: regardless of case', () => {
		expect(sanitizeHref('JaVaScRiPt:alert(1)')).toBe('#');
	});

	it('blocks javascript: obfuscated with an embedded tab', () => {
		expect(sanitizeHref('java\tscript:alert(1)')).toBe('#');
	});

	it('blocks javascript: obfuscated with the named HTML entity for ":"', () => {
		expect(sanitizeHref('javascript&colon;alert(1)')).toBe('#');
	});

	it('blocks javascript: obfuscated with the decimal HTML entity for ":"', () => {
		expect(sanitizeHref('javascript&#58;alert(1)')).toBe('#');
	});

	it('blocks javascript: obfuscated with the hex HTML entity for ":"', () => {
		expect(sanitizeHref('javascript&#x3a;alert(1)')).toBe('#');
	});

	it('blocks a leading-whitespace javascript: URI', () => {
		expect(sanitizeHref('  javascript:alert(1)')).toBe('#');
	});

	it('blocks data: URIs (e.g. data:text/html opened via target=_blank)', () => {
		expect(sanitizeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
	});

	it('blocks vbscript: URIs', () => {
		expect(sanitizeHref('vbscript:msgbox(1)')).toBe('#');
	});

	it('blocks file: URIs', () => {
		expect(sanitizeHref('file:///etc/passwd')).toBe('#');
	});

	it('passes through a safe https URL unchanged', () => {
		expect(sanitizeHref('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
	});

	it('passes through a safe http URL unchanged', () => {
		expect(sanitizeHref('http://example.com')).toBe('http://example.com');
	});

	it('passes through mailto: unchanged', () => {
		expect(sanitizeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
	});

	it('passes through tel: unchanged', () => {
		expect(sanitizeHref('tel:+1234567890')).toBe('tel:+1234567890');
	});

	it('passes through a relative path unchanged', () => {
		expect(sanitizeHref('/relative/path')).toBe('/relative/path');
	});

	it('passes through a fragment unchanged', () => {
		expect(sanitizeHref('#anchor')).toBe('#anchor');
	});

	it('returns "#" for an empty, null, or undefined href', () => {
		expect(sanitizeHref('')).toBe('#');
		expect(sanitizeHref(null)).toBe('#');
		expect(sanitizeHref(undefined)).toBe('#');
	});
});
