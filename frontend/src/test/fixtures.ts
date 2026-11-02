import type { Me } from '@/features/auth';

export function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    id: 'u-1',
    email: 'aziza@example.com',
    full_name: 'Aziza Karimova',
    role: 'candidate',
    locale: 'uz',
    timezone: 'Asia/Tashkent',
    is_email_verified: true,
    created_at: '2026-10-01T09:00:00Z',
    companies: [],
    ...overrides,
  };
}

export function envelope(code: string, details: Record<string, unknown> = {}) {
  return { error: { code, message: code, details, request_id: 'req-test' } };
}

type VacancyCardData = import('@/features/vacancies').VacancyCardData;
type VacancyPage = import('@/features/vacancies').VacancyPage;

export function makeVacancy(overrides: Partial<VacancyCardData> = {}): VacancyCardData {
  return {
    id: 'v-1',
    title: 'Python backend dasturchi',
    company: {
      id: 'c-1',
      name: 'Najot Soft',
      slug: 'najot-soft',
      logo_url: null,
      is_verified: true,
    },
    region_code: 'UZ-TK',
    city: null,
    remote_type: 'remote',
    employment_type: 'full_time',
    experience_level: 'between_1_3',
    salary_min: 15_000_000,
    salary_max: 22_000_000,
    currency: 'UZS',
    skills: [
      { name: 'Python', slug: 'python' },
      { name: 'FastAPI', slug: 'fastapi' },
    ],
    published_at: '2026-10-29T09:00:00Z',
    has_assessment: false,
    viewer: null,
    ...overrides,
  };
}

export function makePage(
  items: VacancyCardData[],
  overrides: Partial<VacancyPage> = {},
): VacancyPage {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 20,
    facets: {
      region: [{ value: 'UZ-TK', count: items.length }],
      remote_type: [{ value: 'remote', count: items.length }],
      employment_type: [{ value: 'full_time', count: items.length }],
      experience_level: [{ value: 'between_1_3', count: items.length }],
    },
    ...overrides,
  };
}
