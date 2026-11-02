import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { emptyQuestionValues } from '../model';
import { QuestionForm } from './question-form';

const CID = 'c-1';

function setup() {
  const posted = vi.fn();
  const onDone = vi.fn();
  server.use(
    http.get(`${API}/api/v1/skills`, () => HttpResponse.json([])),
    http.post(`${API}/api/v1/companies/${CID}/questions`, async ({ request }) => {
      posted(await request.json());
      return HttpResponse.json({ id: 'q-1' }, { status: 201 });
    }),
  );
  renderWithProviders(
    <QuestionForm
      companyId={CID}
      defaultValues={emptyQuestionValues()}
      onDone={onDone}
      onCancel={() => {}}
    />,
  );
  return { posted, onDone };
}

describe('QuestionForm', () => {
  it('mcq: blocks submit without a correct option, then sends options and indexes', async () => {
    const user = userEvent.setup();
    const { posted, onDone } = setup();
    await user.selectOptions(screen.getByLabelText('Turi'), 'mcq');
    await user.type(screen.getByLabelText('Savol matni'), 'Qaysi biri ro‘yxat?');
    await user.type(screen.getByLabelText('Variant 1'), 'Birinchi');
    await user.type(screen.getByLabelText('Variant 2'), 'Ikkinchi');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(
      await screen.findByText("Kamida bitta to'g'ri variantni belgilang."),
    ).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(posted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mcq',
        options: ['Birinchi', 'Ikkinchi'],
        correct_answer: [0],
      }),
    );
  });

  it('open question: requires reference answer and a rubric criterion with a valid key', async () => {
    const user = userEvent.setup();
    const { posted } = setup();
    await user.type(screen.getByLabelText('Savol matni'), 'GIL nima?');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findAllByText("Bu maydonni to'ldiring.")).not.toHaveLength(0);
    expect(posted).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Namunaviy javob'), 'Global Interpreter Lock');
    await user.type(screen.getByLabelText('Nomi'), 'Aniqlik');
    await user.type(screen.getByLabelText(/^Kalit/), 'Bad Key');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByText(/Faqat kichik lotin harflari/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Kalit/));
    await user.type(screen.getByLabelText(/^Kalit/), 'accuracy');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0].rubric.criteria[0]).toMatchObject({
      key: 'accuracy',
      name: 'Aniqlik',
      max_points: 5,
    });
  });
});
