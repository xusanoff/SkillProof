import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ResumeCard } from './resume-card';

const RESUME = `${API}/api/v1/candidate/profile/resume`;

function bigPdf() {
  const f = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: 6 * 1024 * 1024 });
  return f;
}

describe('ResumeCard', () => {
  it('shows filename, size and date of the current resume', () => {
    renderWithProviders(
      <ResumeCard
        resume={{
          filename: 'aziza-cv.pdf',
          size_bytes: 1.5 * 1024 * 1024,
          content_type: 'application/pdf',
          uploaded_at: '2026-10-20T10:00:00Z',
        }}
      />,
    );
    expect(screen.getByText('aziza-cv.pdf')).toBeInTheDocument();
    expect(screen.getByText('1,5 MB · 20.10.2026, 15:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yuklab olish' })).toBeInTheDocument();
  });

  it('rejects a too large file before uploading', async () => {
    const upload = vi.fn();
    server.use(http.post(RESUME, () => (upload(), HttpResponse.json({}))));
    renderWithProviders(<ResumeCard resume={null} />);
    await userEvent.upload(screen.getByLabelText('Fayl yuklash'), bigPdf());
    expect(await screen.findByRole('alert')).toHaveTextContent('Fayl juda katta');
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects an unsupported type before uploading', async () => {
    const upload = vi.fn();
    server.use(http.post(RESUME, () => (upload(), HttpResponse.json({}))));
    renderWithProviders(<ResumeCard resume={null} />);
    const png = new File(['x'], 'photo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Fayl yuklash'), png, { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent("qo'llab-quvvatlanmaydi");
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads a valid file as multipart', async () => {
    let contentType = '';
    let fileSize = -1;
    server.use(
      http.post(RESUME, async ({ request }) => {
        contentType = request.headers.get('content-type') ?? '';
        const form = await request.formData();
        // jsdom loses the part's filename; real browsers keep it (checked in e2e/screenshots).
        fileSize = (form.get('file') as File).size;
        return HttpResponse.json({ currency: 'UZS', open_to_work: true, resume: null });
      }),
    );
    renderWithProviders(<ResumeCard resume={null} />);
    const pdf = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Fayl yuklash'), pdf);
    await vi.waitFor(() => expect(fileSize).toBe(8));
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
  });
});
