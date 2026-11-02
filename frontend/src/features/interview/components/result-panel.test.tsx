import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { Session } from '../model';
import { ResultPanel } from './result-panel';

const session = (result: unknown, status = 'completed') =>
  ({ id: 's', status, result }) as unknown as Session;
const task = {
  title: 'Ikki son',
  hidden_passed: 3,
  hidden_total: 4,
  code_review_percent: 80,
  strengths: ['Aniq kod'],
  weaknesses: ['Chegaraviy holatlar'],
};

describe('ResultPanel', () => {
  it('pending: "being checked", no score', () => {
    renderWithProviders(<ResultPanel session={session({ state: 'pending', tasks: [] })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Kodingiz tekshirilmoqda');
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
  it('a finished session without a result yet is pending too', () => {
    renderWithProviders(<ResultPanel session={session(null, 'expired')} />);
    expect(screen.getByRole('status')).toHaveTextContent('tekshirilmoqda');
  });
  it('failed: delayed, company reviews, no score', () => {
    renderWithProviders(<ResultPanel session={session({ state: 'failed', tasks: [] })} />);
    expect(screen.getByText('Natija kechikmoqda')).toBeInTheDocument();
    expect(screen.getByText(/Kompaniya yechimlaringizni o'zi ko'rib chiqadi/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });
  it('done and passed: score, threshold, hidden tests, strengths, "Stage 2 soon"', () => {
    renderWithProviders(
      <ResultPanel
        session={session({
          state: 'done',
          score_percent: 78,
          pass_threshold: 70,
          passed: true,
          tasks: [task],
        })}
      />,
    );
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText("O'tish chegarasi: 70%")).toBeInTheDocument();
    expect(screen.getByText("1-bosqichdan o'tdingiz")).toBeInTheDocument();
    expect(screen.getByText('Yashirin testlar: 3 / 4')).toBeInTheDocument();
    expect(screen.getByText('Aniq kod')).toBeInTheDocument();
    expect(screen.getByText(/2-bosqich \(ovozli suhbat\) tez orada/)).toBeInTheDocument();
  });
  it('done and not passed: gentle wording, no Stage 2 promise', () => {
    renderWithProviders(
      <ResultPanel
        session={session({
          state: 'done',
          score_percent: 40,
          pass_threshold: 70,
          passed: false,
          tasks: [task],
        })}
      />,
    );
    expect(screen.getByText("Bu safar o'tish chegarasiga yetmadi")).toBeInTheDocument();
    expect(screen.queryByText(/2-bosqich \(ovozli suhbat\) tez orada/)).not.toBeInTheDocument();
    expect(screen.getByText('Chegaraviy holatlar')).toBeInTheDocument();
  });
  it('shows nothing for sessions that have no result (in progress, disqualified)', () => {
    const { container } = renderWithProviders(
      <ResultPanel session={session(null, 'disqualified')} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
