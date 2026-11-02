"""Spec §9: vacancy search < 300 ms at 10k vacancies.

Usage (separate DB so demo data stays small):
  createdb skillproof_bench; DATABASE_URL=.../skillproof_bench uv run alembic upgrade head
  DATABASE_URL=.../skillproof_bench uv run python -m app.seed.demo --bulk 10000
  DATABASE_URL=.../skillproof_bench PYTHONPATH=. uv run python ../scripts/bench_search.py
"""

import asyncio
import statistics
import sys
import time

from httpx import ASGITransport, AsyncClient

from app.main import create_app

QUERIES: list[dict[str, str | list[str]]] = [
    {},
    {"q": "python"},
    {"q": "dasturchi", "remote_type": "remote"},
    {"q": "react typescript", "region": ["UZ-TK", "UZ-SA"], "sort": "salary_desc"},
    {"experience_level": "no_experience", "only_with_salary": "true"},
    {"skill": "docker", "salary_from": "15000000"},
    {"q": "najot", "page": "5"},
]


async def main() -> None:
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://bench") as c:
        total = (await c.get("/api/v1/vacancies")).json()["total"]
        print(f"vacancies: {total}")
        worst = 0.0
        for params in QUERIES:
            timings = []
            for _ in range(10):
                started = time.perf_counter()
                r = await c.get("/api/v1/vacancies", params=params)
                timings.append((time.perf_counter() - started) * 1000)
                assert r.status_code == 200, r.text
            p95 = sorted(timings)[int(len(timings) * 0.95) - 1]
            worst = max(worst, p95)
            print(f"{params!s:80} median {statistics.median(timings):6.1f} ms  p95 {p95:6.1f} ms")
    print(f"worst p95: {worst:.1f} ms -> {'OK' if worst < 300 else 'TOO SLOW'}")
    sys.exit(0 if worst < 300 else 1)


if __name__ == "__main__":
    asyncio.run(main())
