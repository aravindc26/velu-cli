export const PUBLIC_FEEDBACK_ENDPOINT_PATH = '/api/v1/public/feedback';
export const PUBLIC_API_BASE_URL = 'https://api.getvelu.com';

export interface PublicFeedbackPayload {
  page_url: string;
  helpful: boolean;
  reason_text: string;
  details?: string;
  email?: string;
}

interface BuildPayloadInput {
  pageUrl: string;
  helpful: boolean;
  reasonText: string;
  details?: string;
  email?: string;
}

export interface SubmitPublicFeedbackInput extends BuildPayloadInput {
  siteHost: string;
  fetchImpl?: typeof fetch;
}

type SubmitErrorReason = 'invalid_payload' | 'request_failed' | 'network_error';

export type SubmitPublicFeedbackResult =
  | { ok: true }
  | { ok: false; reason: SubmitErrorReason; status?: number };

function trimOptional(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolvePublicFeedbackEndpoint(): string {
  return `${PUBLIC_API_BASE_URL}${PUBLIC_FEEDBACK_ENDPOINT_PATH}`;
}

export function buildPublicFeedbackPayload(input: BuildPayloadInput): PublicFeedbackPayload | null {
  const pageUrl = trimOptional(input.pageUrl);
  const reasonText = trimOptional(input.reasonText);
  if (!pageUrl || !reasonText) return null;

  const payload: PublicFeedbackPayload = {
    page_url: pageUrl,
    helpful: input.helpful,
    reason_text: reasonText,
  };

  const details = trimOptional(input.details);
  if (details) payload.details = details;

  const email = trimOptional(input.email);
  if (email) payload.email = email;

  return payload;
}

export async function submitPublicFeedback(input: SubmitPublicFeedbackInput): Promise<SubmitPublicFeedbackResult> {
  const payload = buildPublicFeedbackPayload(input);
  if (!payload) return { ok: false, reason: 'invalid_payload' };

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(resolvePublicFeedbackEndpoint(), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-velu-site-host': input.siteHost,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: 'request_failed',
        status: response.status,
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}
