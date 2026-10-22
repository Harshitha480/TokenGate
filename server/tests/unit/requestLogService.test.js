const RequestLog = require('../../src/models/RequestLog');
const { createRequestLogService } = require('../../src/services/requestLogService');

describe('request log service', () => {
  afterEach(() => jest.restoreAllMocks());

  const entry = { requestId: 'req-12345678', status: 'success' };

  it('never lets a failed log write reach the request', async () => {
    jest.spyOn(RequestLog, 'create').mockRejectedValue(new Error('disk full'));
    const logger = { error: jest.fn() };

    const result = await createRequestLogService({ logPrompts: false, logger }).record(entry);

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-12345678' }),
      'Failed to write request log',
    );
  });

  it('truncates very long prompts when prompt logging is on', async () => {
    const create = jest.spyOn(RequestLog, 'create').mockResolvedValue({});
    const service = createRequestLogService({ logPrompts: true, logger: { error: jest.fn() } });

    await service.record(entry, {
      messages: [{ role: 'user', content: 'x'.repeat(20_000) }],
      completionText: 'done',
    });

    const stored = create.mock.calls[0][0];
    expect(stored.prompt.length).toBeLessThanOrEqual(8001);
    expect(stored.prompt.endsWith('…')).toBe(true);
    expect(stored.completion).toBe('done');
  });
});
