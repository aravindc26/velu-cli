'use client';

import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

type Vote = 'yes' | 'no';

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

  const showForm = vote === 'no';
  const showOptionalInputs = selectedReason === 'Something else';

  const onChooseVote = (value: Vote) => {
    if (vote === value) return;
    setVote(value);
    setSelectedReason('');
    setDetails('');
    setEmail('');
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
  };

  const onSubmit = () => {
    // Placeholder for analytics/reporting integration.
    onCancel();
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
          <h3 className="velu-page-feedback-panel-title">How can we improve our product?</h3>

          <div className="velu-page-feedback-options" role="radiogroup" aria-label="Feedback reasons">
            {NO_OPTIONS.map((option) => {
              const checked = selectedReason === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  className={['velu-page-feedback-option', checked ? 'is-checked' : ''].filter(Boolean).join(' ')}
                  onClick={(event) => {
                    stopEvent(event);
                    setSelectedReason(option);
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
                onChange={(event) => setDetails(event.target.value)}
              />
              <input
                className="velu-page-feedback-input"
                type="email"
                placeholder="(Optional) Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          ) : null}

          <div className="velu-page-feedback-cta">
            <button
              type="button"
              className="velu-page-feedback-cancel"
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
              onClick={(event) => {
                stopEvent(event);
                onSubmit();
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
