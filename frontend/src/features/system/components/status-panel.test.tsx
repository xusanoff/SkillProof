import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { StatusPanel } from './status-panel';

const healthy = {
  status: 'ok',
  version: '0.1.0',
  environment: 'local',
  checks: { database: 'ok', redis: 'ok' },
};

describe('StatusPanel', () => {
  it('shows a loading state first', async () => {
    server.use(
      http.get(`${API}/health`, async () => {
        await delay('infinite');
        return HttpResponse.json(healthy);
      }),
    );
    renderWithProviders(<StatusPanel />);
    expect(screen.getByText('Tekshirilmoqda…')).toBeInTheDocument();
    expect(screen.getByTestId('status-skeleton')).toBeInTheDocument();
  });

  it('shows ok state with version, environment and checks', async () => {
    server.use(http.get(`${API}/health`, () => HttpResponse.json(healthy)));
    renderWithProviders(<StatusPanel />);

    expect(await screen.findByText('Ishlayapti')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('local')).toBeInTheDocument();
    expect(screen.getByText("Ma'lumotlar bazasi")).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a degraded state when a dependency fails', async () => {
    server.use(
      http.get(`${API}/health`, () =>
        HttpResponse.json({ ...healthy, checks: { database: 'ok', redis: 'error' } }),
      ),
    );
    renderWithProviders(<StatusPanel />);
    expect(await screen.findByText('Qisman ishlayapti')).toBeInTheDocument();
    expect(screen.getByText('javob bermayapti')).toBeInTheDocument();
  });

  it('shows unavailable with the translated error and request id, and can retry', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/health`, () => {
        calls += 1;
        if (calls <= 3) {
          return HttpResponse.json(
            {
              error: {
                code: 'upstream_unavailable',
                message: 'down',
                details: {},
                request_id: 'req-42',
              },
            },
            { status: 502 },
          );
        }
        return HttpResponse.json(healthy);
      }),
    );
    renderWithProviders(<StatusPanel />);

    const alert = await screen.findByRole('alert');
    expect(screen.getByText('Mavjud emas')).toBeInTheDocument();
    expect(alert).toHaveTextContent("API serveriga ulanib bo'lmadi");
    expect(alert).toHaveTextContent('Server hozir javob bermayapti');
    expect(alert).toHaveTextContent("So'rov ID: req-42");
    expect(calls).toBe(3); // 1 try + 2 retries on 5xx

    await userEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    expect(await screen.findByText('Ishlayapti')).toBeInTheDocument();
  });

  it('does not retry on 4xx', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/health`, () => {
        calls += 1;
        return HttpResponse.json(
          { error: { code: 'not_found', message: 'x', request_id: null } },
          { status: 404 },
        );
      }),
    );
    renderWithProviders(<StatusPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent("So'ralgan ma'lumot topilmadi.");
    expect(calls).toBe(1);
  });
});
