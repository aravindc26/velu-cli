'use client';

import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { submitPublicFeedback } from './page-feedback-api';

type Vote = 'yes' | 'no';

const YES_OPTIONS = [
  'The guide worked as expected',
  'It was easy to find the information I needed',
  'It was easy to understand the product and features',
  'The documentation is up to date',
  'Something else',
];

const NO_OPTIONS = [
  'Help me get started faster',
  'Make it easier to find what I\'m looking for',
  'Make it easy to understand the product and features',
  'Update this documentation',
  'Something else',
];

export function PageFeedback() {
  const [vote, setVote] = useState<Vote | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const showForm = vote !== null;
  const options = vote === 'yes' ? YES_OPTIONS : NO_OPTIONS;
  const showOptionalInputs = selectedReason === 'Something else';
  const canSubmit = vote !== null && selectedReason.trim().length > 0 && !isSubmitting;

  const onChooseVote = (value: Vote) => {
    if (vote === value) return;
    setVote(value);
    setSelectedReason('');
    setDetails('');
    setEmail('');
    setSubmitError(false);
  };

  const stopEvent = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onCancel = () => {
    setVote(null);
    setSelectedReason('');
    setDetails('');
    setEmail('');
    setIsSubmitting(false);
    setSubmitError(false);
  };

  const onSubmit = async () => {
    if (!vote || !selectedReason.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(false);

    const result = await submitPublicFeedback({
      helpful: vote === 'yes',
      reasonText: selectedReason,
      details: showOptionalInputs ? details : undefined,
      email: showOptionalInputs ? email : undefined,
      pageUrl: window.location.href,
      siteHost: window.location.host,
    });

    if (result.ok) {
      onCancel();
      return;
    }

    setSubmitError(true);
    setIsSubmitting(false);
  };

  return (
    <div className="velu-page-feedback-block">
      <div className="velu-page-feedback-row">
        <p className="velu-page-feedback-question">Was this page helpful?</p>
        <div className="velu-page-feedback-actions" role="group" aria-label="Feedback options">
          <button
            type="button"
            className={['velu-page-feedback-btn', vote === 'yes' ? 'is-active' : ''].filter(Boolean).join(' ')}
            aria-label="Mark page as helpful"
            disabled={isSubmitting}
            onClick={(event) => {
              stopEvent(event);
              onChooseVote('yes');
            }}
          >
            <ThumbsUp />
            <span>Yes</span>
          </button>
          <button
            type="button"
            className={['velu-page-feedback-btn', vote === 'no' ? 'is-active' : ''].filter(Boolean).join(' ')}
            aria-label="Mark page as not helpful"
            disabled={isSubmitting}
            onClick={(event) => {
              stopEvent(event);
              onChooseVote('no');
            }}
          >
            <ThumbsDown />
            <span>No</span>
          </button>
        </div>
      </div>

      {showForm ? (
        <div className="velu-page-feedback-panel">
          <h3 className="velu-page-feedback-panel-title">
            {vote === 'yes' ? 'Great! What worked best for you?' : 'How can we improve our product?'}
          </h3>

          <div className="velu-page-feedback-options" role="radiogroup" aria-label="Feedback reasons">
            {options.map((option) => {
              const checked = selectedReason === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={isSubmitting}
                  className={['velu-page-feedback-option', checked ? 'is-checked' : ''].filter(Boolean).join(' ')}
                  onClick={(event) => {
                    stopEvent(event);
                    setSelectedReason(option);
                    setSubmitError(false);
                  }}
                >
                  <span className="velu-page-feedback-radio" aria-hidden="true" />
                  <span>{option}</span>
                </button>
              );
            })}
          </div>

          {showOptionalInputs ? (
            <div className="velu-page-feedback-inputs">
              <textarea
                className="velu-page-feedback-input"
                rows={3}
                placeholder="(Optional) Could you share more about your experience?"
                value={details}
                disabled={isSubmitting}
                onChange={(event) => setDetails(event.target.value)}
              />
              <input
                className="velu-page-feedback-input"
                type="email"
                placeholder="(Optional) Email"
                value={email}
                disabled={isSubmitting}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          ) : null}

          <div className="velu-page-feedback-cta">
            <button
              type="button"
              className="velu-page-feedback-cancel"
              disabled={isSubmitting}
              onClick={(event) => {
                stopEvent(event);
                onCancel();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="velu-page-feedback-submit"
              disabled={!canSubmit}
              aria-busy={isSubmitting}
              title={submitError ? 'Unable to submit feedback right now. Please try again.' : undefined}
              onClick={(event) => {
                stopEvent(event);
                void onSubmit();
              }}
            >
              Submit feedback
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
