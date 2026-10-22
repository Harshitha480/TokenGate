const request = require('supertest');
const { createApp } = require('../../src/app');

describe('error responses', () => {
  const app = createApp();

  it('uses the standard error shape for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'route_not_found',
        message: 'No route for GET /does-not-exist',
        requestId: res.headers['x-request-id'],
      },
    });
  });

  it('rejects malformed JSON with a 400 instead of a 500', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});
