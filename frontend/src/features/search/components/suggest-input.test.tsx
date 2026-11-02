import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { emptySuggestSource, type SuggestSource } from '../suggest';
import { SuggestInput } from './suggest-input';

function Harness({ source, onPick }: { source: SuggestSource; onPick?: () => void }) {
  const [v, setV] = useState('');
  return (
    <SuggestInput aria-label="q" value={v} onValueChange={setV} source={source} onPick={onPick} />
  );
}

describe('SuggestInput', () => {
  it('with the empty source behaves as a plain input', async () => {
    renderWithProviders(<Harness source={emptySuggestSource} />);
    await userEvent.type(screen.getByRole('combobox', { name: 'q' }), 'python');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('shows suggestions from a source and picks with the keyboard', async () => {
    const onPick = vi.fn();
    const source: SuggestSource = {
      minLength: 2,
      suggest: async () => [
        { kind: 'vacancy', label: 'Python developer' },
        { kind: 'skill', label: 'Python' },
      ],
    };
    renderWithProviders(<Harness source={source} onPick={onPick} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'py');
    expect(await screen.findAllByRole('option')).toHaveLength(2);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(input).toHaveValue('Python');
    expect(onPick).toHaveBeenCalledWith({ kind: 'skill', label: 'Python' });
  });
});
