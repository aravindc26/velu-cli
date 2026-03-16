import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicFeedbackPayload,
  PUBLIC_API_BASE_URL,
  PUBLIC_FEEDBACK_ENDPOINT_PATH,
  resolvePublicFeedbackEndpoint,
  submitPublicFeedback,
} from './page-feedback-api';

test('buildPublicFeedbackPayload returns contract body with optional fields', () => {
  const payload = buildPublicFeedbackPayload({
    pageUrl: 'https://docs.example.com/guide',
    helpful: true,
    reasonText: 'The guide worked as expected',
    details: '  Extra details  ',
    email: '  user@example.com  ',
  });

  assert.deepEqual(payload, {
    page_url: 'https://docs.example.com/guide',
    helpful: true,
    reason_text: 'The guide worked as expected',
    details: 'Extra details',
    email: 'user@example.com',
  });
});

test('resolvePublicFeedbackEndpoint appends the fixed endpoint path', () => {
  assert.equal(
    resolvePublicFeedbackEndpoint(),
    `${PUBLIC_API_BASE_URL}${PUBLIC_FEEDBACK_ENDPOINT_PATH}`,
  );
});

test('submitPublicFeedback posts the expected payload and headers', async () => {
  let receivedUrl = '';
  let receivedInit: RequestInit | undefined;

  const fetchImpl: typeof fetch = async (input, init) => {
    receivedUrl = String(input);
    receivedInit = init;
    return new Response(null, { status: 204 });
  };

  const result = await submitPublicFeedback({
    pageUrl: 'https://docs.example.com/page',
    helpful: false,
    reasonText: 'Update this documentation',
    details: '',
    email: undefined,
    siteHost: 'docs.example.com',
    fetchImpl,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(receivedUrl, `${PUBLIC_API_BASE_URL}${PUBLIC_FEEDBACK_ENDPOINT_PATH}`);
  assert.equal(receivedInit?.method, 'POST');
  assert.equal(receivedInit?.credentials, 'include');
  assert.equal(receivedInit?.body, JSON.stringify({
    page_url: 'https://docs.example.com/page',
    helpful: false,
    reason_text: 'Update this documentation',
  }));

  const headers = receivedInit?.headers as Record<string, string>;
  assert.deepEqual(headers, {
    'Content-Type': 'application/json',
    'x-velu-site-host': 'docs.example.com',
  });
});

test('submitPublicFeedback reports non-2xx responses as request_failed', async () => {
  const result = await submitPublicFeedback({
    pageUrl: 'https://docs.example.com/page',
    helpful: true,
    reasonText: 'Something else',
    siteHost: 'docs.example.com',
    fetchImpl: async () => new Response(null, { status: 500 }),
  });

  assert.deepEqual(result, { ok: false, reason: 'request_failed', status: 500 });
});
