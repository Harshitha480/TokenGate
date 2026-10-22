const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { requestId } = require('../../src/middleware/requestId');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { AppError } = require('../../src/lib/errors');

// A minimal app with routes that fail in each way the central handler must cover.
function createProbeApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json({ limit: '1kb' }));
  app.post('/echo', (req, res) => res.json(req.body));
  app.get('/bug', () => {
    throw new Error('connection string mongodb://admin:hunter2@db leaked');
  });
  app.get('/cast', () => {
    throw new mongoose.Error.CastError('ObjectId', 'nope', 'id');
  });
  app.get('/rate-limited', () => {
    throw new AppError(429, 'rate_limit_exceeded', 'Slow down', {
      headers: { 'Retry-After': '7' },
    });
  });
  app.get('/half-sent', (req, res) => {
    res.write('partial');
    throw new Error('failed mid-response');
  });
  app.use(errorHandler);
  return app;
}

describe('central error handler', () => {
  const app = createProbeApp();

  it('hides the details of unexpected errors behind a generic 500', async () => {
    const res = await request(app).get('/bug');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'internal_error',
      message: 'Something went wrong on our side',
      requestId: res.headers['x-request-id'],
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('maps invalid ids to a 400', async () => {
    const res = await request(app).get('/cast');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_id');
  });

  it('rejects oversized bodies with a 413', async () => {
    const res = await request(app)
      .post('/echo')
      .send({ text: 'x'.repeat(5000) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('sends headers attached to an AppError', async () => {
    const res = await request(app).get('/rate-limited');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('7');
  });

  it('ends a response that had already started instead of crashing', async () => {
    const res = await request(app).get('/half-sent');

    expect(res.status).toBe(200);
    expect(res.text).toBe('partial');
  });
});
