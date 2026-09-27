const axios = require('axios');
jest.mock('axios', () => {
  return {
    create: jest.fn().mockReturnValue({
      post: jest.fn().mockRejectedValue(new Error('API Down'))
    })
  };
});
const memory = require('../src/memory');

describe('memory.recallSimilar', () => {
  it('falls back to local keyword logic when API fails', async () => {
    const res = await memory.recallSimilar('error some random timeout', 'auth-service');
    expect(Array.isArray(res)).toBe(true);
  });
});
