import { describe, expect, test } from 'bun:test';
import { cleanTitle } from '../../core';
import { computeArrival } from '../../extension/src/background';
import { NOW, visit } from '../core/fixtures';

const search = visit({ url: 'https://www.google.com/search?q=decision+latency', title: 'decision latency - Google Search' });
const article = 'https://example.com/context';

describe('computeArrival', () => {
  test('a result clicked on a search page is a search arrival', () => {
    const a = computeArrival({
      url: article,
      referrer: '',
      nav: { url: article, transition: 'link', qualifiers: [], at: NOW - 500 },
      prev: search,
      click: { label: 'Context is the new interface', href: article, at: NOW - 900 },
      newTab: false,
      now: NOW,
    });
    expect(a).toMatchObject({ kind: 'search', searchQuery: 'decision latency', viaLabel: 'Context is the new interface', fromTitle: search.title });
  });

  test('typing an address ignores whatever the tab showed before', () => {
    const a = computeArrival({ url: article, referrer: '', nav: { url: article, transition: 'typed', qualifiers: ['from_address_bar'], at: NOW }, prev: search, newTab: false, now: NOW });
    expect(a).toEqual({ kind: 'typed' });
  });

  test('back and forward are recognised', () => {
    const a = computeArrival({ url: article, referrer: '', nav: { url: article, transition: 'link', qualifiers: ['forward_back'], at: NOW }, prev: search, newTab: false, now: NOW });
    expect(a.kind).toBe('back_forward');
  });

  test('following a Tacit suggestion is marked as such', () => {
    const a = computeArrival({
      url: article,
      referrer: '',
      nav: { url: article, transition: 'link', qualifiers: [], at: NOW },
      prev: visit({ url: 'https://example.com/a', title: 'A' }),
      click: { label: 'Open', href: article, at: NOW, viaTacit: true },
      newTab: false,
      now: NOW,
    });
    expect(a.kind).toBe('tacit');
  });

  test('a search that redirects straight to a result still counts as a search', () => {
    const a = computeArrival({
      url: 'https://en.wikipedia.org/wiki/Human%E2%80%93computer_interaction',
      referrer: '',
      nav: { url: 'https://en.wikipedia.org/wiki/Human%E2%80%93computer_interaction', transition: 'form_submit', qualifiers: ['server_redirect'], at: NOW },
      requested: { url: 'https://en.wikipedia.org/w/index.php?search=human+computer+interaction', at: NOW - 300 },
      newTab: false,
      now: NOW,
    });
    expect(a).toMatchObject({ kind: 'search', searchQuery: 'human computer interaction' });
  });

  test('a new tab opened from a plain page is a new-tab arrival', () => {
    const a = computeArrival({ url: article, referrer: '', prev: visit({ url: 'https://news.example.com/', title: 'News' }), newTab: true, now: NOW });
    expect(a).toMatchObject({ kind: 'new_tab', fromTitle: 'News' });
  });

  test('a stale click label is not attached to an unrelated page', () => {
    const a = computeArrival({
      url: article,
      referrer: '',
      nav: { url: article, transition: 'link', qualifiers: [], at: NOW },
      prev: visit({ url: 'https://example.com/a', title: 'A' }),
      click: { label: 'Elsewhere', href: 'https://other.example/', at: NOW - 60_000 },
      newTab: false,
      now: NOW,
    });
    expect(a).toMatchObject({ kind: 'link', viaLabel: undefined });
  });
});

describe('cleanTitle', () => {
  test('drops a short site suffix', () => {
    expect(cleanTitle('Human–computer interaction - Wikipedia')).toBe('Human–computer interaction');
    expect(cleanTitle('Notes on a context harness · Field Notes')).toBe('Notes on a context harness');
  });

  test('leaves titles without a suffix alone', () => {
    expect(cleanTitle('Latency: why 400 ms matters')).toBe('Latency: why 400 ms matters');
    expect(cleanTitle('Context - the new interface')).toBe('Context - the new interface');
  });
});
