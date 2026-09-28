export const id = () => crypto.randomUUID();
export function validateBundle(input) {
  if (!input || input.format !== 'requestbench' || input.version !== 1) throw new Error('Expected a Requestbench JSON export (version 1).');
  for (const kind of ['requests', 'environments', 'fixtures']) {
    if (!Array.isArray(input[kind])) throw new Error(`${kind} must be an array.`);
    if (input[kind].length > 1000) throw new Error('An import may contain at most 1,000 items of each type.');
    for (const item of input[kind]) {
      if (!item || typeof item.name !== 'string' || !item.name.trim()) throw new Error(`Every ${kind} item needs a name.`);
      if (kind === 'requests' && (typeof item.url !== 'string' || !['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(item.method) || typeof item.body !== 'string' || !Array.isArray(item.headers))) throw new Error('Invalid request.');
      if (kind === 'requests' && item.bearer !== undefined && typeof item.bearer !== 'string') throw new Error('Bearer token must be a string.');
      if (kind === 'environments' && !Array.isArray(item.variables)) throw new Error('Invalid environment variables.');
      if (kind === 'fixtures' && (typeof item.body !== 'string' || !['request','response'].includes(item.kind))) throw new Error('Invalid fixture.');
      for (const row of (kind === 'requests' ? item.headers : kind === 'environments' ? item.variables : [])) {
        if (!row || typeof row.key !== 'string' || typeof row.value !== 'string') throw new Error('Keys and values must be strings.');
      }
    }
  }
  return input;
}
export function exportBundle(state, includeSecrets = false) {
  return {format:'requestbench', version:1, exportedAt:new Date().toISOString(), requests:state.requests, fixtures:state.fixtures, environments:state.environments.map(e => ({...e, variables:e.variables.map(v => ({...v, value:v.secret && !includeSecrets ? '' : v.value}))}))};
}
export function interpolate(value, variables) {
  const lookup = new Map(variables.filter(v => v.enabled !== false).map(v => [v.key, v.value]));
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => {
    if (!lookup.has(key)) throw new Error(`Missing environment variable: ${key}`);
    return lookup.get(key);
  });
}
