const { chunkText } = require('../../src/services/gateway/streaming');

describe('chunkText', () => {
  it('counts content and reasoning, and NVIDIA duplicated reasoning only once', () => {
    expect(chunkText({ choices: [{ delta: { content: 'Hi' } }] })).toBe('Hi');
    expect(
      chunkText({ choices: [{ delta: { reasoning: 'think', reasoning_content: 'think' } }] }),
    ).toBe('think');
    expect(chunkText({ choices: [], usage: {} })).toBe('');
  });
});
