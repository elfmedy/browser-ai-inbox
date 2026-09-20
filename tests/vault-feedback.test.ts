import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectVault } from '../src/extension/inbox-vaults';
import { feedbackText } from '../src/extension/inbox-text';
import { VaultUnavailableFailure } from '../src/extension/inbox-types';
import { diagnosticText } from '../src/extension/inbox-diagnostics';

afterEach(() => vi.unstubAllGlobals());
describe('unavailable default vault feedback', () => {
  it.each([{ names: [] }, { names: ['work'] }, { names: ['work', 'notes'] }])('keeps the default and reports available vaults $names', async ({ names }) => {
    const connection = { endpoint: 'http://127.0.0.1:27125/', vaultId: '11111111-1111-4111-8111-111111111111', token: 'a'.repeat(64) };
    const set = vi.fn(); const remove = vi.fn();
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ connection, defaultVaultName: 'p0-vault' }), set, remove } } });
    const fetcher = vi.fn(async (input: URL) => {
      const index = Number(new URL(input).port) - 27125;
      if (!names[index]) throw new Error('Offline');
      return Response.json({ app: 'ai-inbox', protocolVersion: 1, pairingVersion: 1, vaultName: names[index],
        vaultId: `22222222-2222-4222-8222-22222222222${index}` });
    });
    vi.stubGlobal('fetch', fetcher);
    const error = await selectVault(undefined, vi.fn()).catch(value => value);
    expect(error).toBeInstanceOf(VaultUnavailableFailure);
    expect(error.defaultVaultName).toBe('p0-vault');
    expect(error.availableVaultNames).toEqual([...names].sort());
    expect(set).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.every(([url]) => new URL(url).pathname === '/v1/discovery')).toBe(true);
    const data = { stage: 'error' as const, code: error.code, defaultVaultName: error.defaultVaultName, availableVaultNames: error.availableVaultNames };
    expect(feedbackText(data, true)).toContain('默认仓库「p0-vault」');
    expect(feedbackText(data, false)).toContain('default vault “p0-vault”');
    for (const name of names) expect(feedbackText(data, true)).toContain(`「${name}」`);
    expect(feedbackText(data, true)).not.toContain('当前仓库');
    expect(diagnosticText(data, '0.5.1')).not.toContain('p0-vault');
    expect(remove).toHaveBeenCalledWith('pairingStatus');
  });
  it('handles old settings without a stored name', () => {
    const text = feedbackText({ stage: 'error', code: 'DEFAULT_VAULT_UNAVAILABLE' }, true);
    expect(text).toContain('默认仓库'); expect(text).not.toContain('undefined'); expect(text).not.toContain('「」');
  });
});
