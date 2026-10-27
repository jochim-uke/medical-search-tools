// Only pass a selected public source URL to Zotero, never archive notes or comments.
export function sourceOptions(entry) {
  const sources = new Map();
  function add(value, label) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
      url.hash = '';
      if (!sources.has(url.href)) sources.set(url.href, {url: url.href, label: label || url.href});
    } catch { /* Invalid or absent sources cannot be saved. */ }
  }
  add(entry.source_url, 'Originalquelle');
  const body = String(entry.body || '');
  for (const match of body.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) add(match[2], match[1]);
  for (const match of body.matchAll(/https?:\/\/[^\s<>"\])]+/g)) add(match[0].replace(/[.,;]+$/, ''));
  return [...sources.values()];
}

export function zoteroSaveUrl(source) {
  const [valid] = sourceOptions({source_url: source});
  if (!valid) throw new Error('Bitte eine gültige Originalquelle auswählen.');
  return 'https://www.zotero.org/save?q=' + encodeURIComponent(valid.url);
}
