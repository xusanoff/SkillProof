"""Demo data for local development and screenshots: `python -m app.seed.demo [--bulk N]`.

Idempotent: demo companies/users are recognised by their fixed slugs/emails and skipped.
Refuses to run outside `local`/`test`. `--bulk N` adds N extra generated vacancies
(used by scripts/bench_search.py for the spec §9 "< 300 ms at 10k vacancies" check).
"""

import argparse
import asyncio
import random
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Assessment,
    AssessmentQuestion,
    CandidateProfile,
    Company,
    CompanyMember,
    PracticalTask,
    Question,
    Skill,
    User,
    Vacancy,
    VacancySkill,
)
from app.models.enums import (
    EmploymentType,
    ExperienceLevel,
    MemberRole,
    QuestionType,
    RemoteType,
    UserRole,
    VacancyStatus,
)

DEMO_PASSWORD = "Demo-parol-2026"
# example.com is reserved for documentation (RFC 2606) and passes email validation;
# ".local" addresses are rejected by the validator, so login was impossible (fixed in Phase 2).
DEMO_HR_EMAIL = "demo.hr@example.com"
DEMO_CANDIDATE_EMAIL = "demo.candidate@example.com"
_OLD_DEMO_DOMAIN = "@skillproof.local"

COMPANIES = [
    ("Najot Soft", "najot-soft", "UZ-TK", "Fintech va to'lov tizimlari. 120+ xodim.", True),
    ("Lazurit Tech", "lazurit-tech", "UZ-TK", "E-commerce platformalar va marketpleyslar.", True),
    ("Samarqand Digital", "samarqand-digital", "UZ-SA", "Turizm va bron qilish servislari.", False),
    (
        "Ipak Yo'li Data",
        "ipak-yoli-data",
        "UZ-TK",
        "Bank va telekom uchun ma'lumotlar tahlili.",
        True,
    ),
    ("Buxoro Labs", "buxoro-labs", "UZ-BU", "Mobil ilovalar studiyasi.", False),
    (
        "Farg'ona Cloud",
        "fargona-cloud",
        "UZ-FA",
        "Bulut infratuzilmasi va DevOps xizmatlari.",
        False,
    ),
    ("Toshkent Logistics IT", "toshkent-logistics-it", "UZ-TO", "Yuk tashish uchun SaaS.", True),
    ("EduPro", "edupro", "UZ-TK", "Onlayn ta'lim platformasi.", False),
]

# (uz title, ru title, profession area, skills, experience, salary range in mln UZS)
ROLES = [
    (
        "Python backend dasturchi",
        "Python backend-разработчик",
        "it",
        ["Python", "FastAPI", "PostgreSQL", "Docker", "Redis"],
        "between_3_6",
        (15, 28),
    ),
    (
        "Junior Python dasturchi",
        "Junior Python-разработчик",
        "it",
        ["Python", "Django", "SQL", "Git"],
        "no_experience",
        (5, 9),
    ),
    (
        "Frontend dasturchi (React)",
        "Frontend-разработчик (React)",
        "it",
        ["React", "TypeScript", "Next.js", "Tailwind CSS"],
        "between_1_3",
        (10, 18),
    ),
    (
        "Senior Frontend dasturchi",
        "Senior Frontend-разработчик",
        "it",
        ["React", "TypeScript", "Redux", "GraphQL"],
        "more_than_6",
        (25, 40),
    ),
    (
        "Go dasturchi",
        "Go-разработчик",
        "it",
        ["Go", "PostgreSQL", "gRPC", "Kubernetes", "Apache Kafka"],
        "between_3_6",
        (20, 35),
    ),
    (
        "Java dasturchi (Spring)",
        "Java-разработчик (Spring)",
        "it",
        ["Java", "Spring Boot", "PostgreSQL", "Microservices"],
        "between_3_6",
        (18, 32),
    ),
    (
        "Flutter dasturchi",
        "Flutter-разработчик",
        "it",
        ["Flutter", "Dart", "REST API", "Git"],
        "between_1_3",
        (10, 20),
    ),
    (
        "Android dasturchi",
        "Android-разработчик",
        "it",
        ["Kotlin", "Android", "REST API"],
        "between_1_3",
        (12, 22),
    ),
    (
        "DevOps muhandis",
        "DevOps-инженер",
        "it",
        ["Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "AWS"],
        "between_3_6",
        (22, 38),
    ),
    (
        "QA muhandis (manual)",
        "QA-инженер (ручное тестирование)",
        "it",
        ["Manual testing", "Postman", "SQL"],
        "no_experience",
        (6, 10),
    ),
    (
        "QA avtomatlashtirish muhandisi",
        "QA Automation-инженер",
        "it",
        ["Playwright", "Python", "Pytest", "CI/CD"],
        "between_1_3",
        (12, 20),
    ),
    (
        "Ma'lumotlar tahlilchisi",
        "Аналитик данных",
        "data",
        ["SQL", "Python", "Pandas", "Power BI", "Excel"],
        "between_1_3",
        (10, 18),
    ),
    (
        "Data engineer",
        "Data-инженер",
        "data",
        ["Python", "Apache Kafka", "ClickHouse", "SQL", "Docker"],
        "between_3_6",
        (20, 34),
    ),
    (
        "Machine Learning muhandis",
        "ML-инженер",
        "data",
        ["Python", "Machine Learning", "Pandas", "Docker"],
        "between_3_6",
        (25, 45),
    ),
    (
        "PHP dasturchi (Laravel)",
        "PHP-разработчик (Laravel)",
        "it",
        ["PHP", "Laravel", "MySQL", "Redis"],
        "between_1_3",
        (9, 16),
    ),
    (
        ".NET dasturchi",
        ".NET-разработчик",
        "it",
        ["C#", ".NET", "PostgreSQL", "REST API"],
        "between_3_6",
        (18, 30),
    ),
    (
        "Node.js dasturchi",
        "Node.js-разработчик",
        "it",
        ["Node.js", "NestJS", "TypeScript", "MongoDB"],
        "between_1_3",
        (12, 22),
    ),
    (
        "Stajyor dasturchi",
        "Стажёр-разработчик",
        "it",
        ["Git", "SQL", "HTML/CSS"],
        "no_experience",
        (3, 5),
    ),
]

DESCRIPTIONS = {
    "uz": (
        "Biz {company} jamoasiga {title} qidiryapmiz.\n\n"
        "Vazifalar:\n- Mahsulot jamoasi bilan yangi imkoniyatlarni ishlab chiqish\n"
        "- Kod sifati, testlar va code review\n- Ishlab chiqarishdagi muammolarni tahlil qilish\n\n"
        "Biz taklif qilamiz:\n- Rasmiy ishga joylashish\n- Moslashuvchan ish vaqti\n"
        "- O'qish va konferensiyalar uchun byudjet"
    ),
    "ru": (
        "Мы ищем {title} в команду {company}.\n\n"
        "Задачи:\n- Разработка новых функций вместе с продуктовой командой\n"
        "- Качество кода, тесты и code review\n- Разбор инцидентов в продакшене\n\n"
        "Мы предлагаем:\n- Официальное трудоустройство\n- Гибкий график\n"
        "- Бюджет на обучение и конференции"
    ),
}
REQUIREMENTS = {
    "uz": "Talablar: {skills} bilan ishlash tajribasi; jamoada ishlash; o'zbek yoki rus tili.",
    "ru": "Требования: опыт работы с {skills}; умение работать в команде; русский или узбекский.",
}


async def _user(session: AsyncSession, email: str, name: str, role: UserRole) -> User:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        # Databases seeded before the domain change: rename instead of duplicating.
        old_email = email.replace("@example.com", _OLD_DEMO_DOMAIN)
        user = await session.scalar(select(User).where(User.email == old_email))
        if user is not None:
            user.email = email
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(DEMO_PASSWORD),
            full_name=name,
            role=role,
            is_email_verified=True,
        )
        session.add(user)
        await session.flush()
    return user


async def _vacancy(
    session: AsyncSession,
    rng: random.Random,
    company: Company,
    region: str,
    role: tuple[str, str, str, list[str], str, tuple[int, int]],
    skills_by_name: dict[str, Skill],
    published_at: datetime,
    hr: User,
) -> None:
    title_uz, title_ru, area, skill_names, exp, (lo, hi) = role
    lang = rng.choice(["uz", "uz", "ru"])
    title = title_uz if lang == "uz" else title_ru
    salary_mode = rng.random()
    salary_min = lo * 1_000_000 if salary_mode < 0.8 else None
    salary_max = hi * 1_000_000 if salary_mode > 0.3 else None
    v = Vacancy(
        company_id=company.id,
        title=title,
        description=DESCRIPTIONS[lang].format(company=company.name, title=title.lower()),
        requirements=REQUIREMENTS[lang].format(skills=", ".join(skill_names[:3])),
        profession_area=area,
        country="UZ",
        region_code=region,
        city=None,
        remote_type=rng.choice(list(RemoteType)),
        employment_type=EmploymentType.internship
        if "Stajyor" in title_uz
        else rng.choices(list(EmploymentType)[:3], weights=[8, 2, 1])[0],
        experience_level=ExperienceLevel(exp),
        salary_min=salary_min,
        salary_max=salary_max,
        currency="UZS" if rng.random() < 0.85 else "USD",
        status=VacancyStatus.published,
        published_at=published_at,
        created_by=hr.id,
        skills_text=" ".join(skill_names),
    )
    if v.currency == "USD":
        v.salary_min = salary_min // 12_500 if salary_min else None
        v.salary_max = salary_max // 12_500 if salary_max else None
    session.add(v)
    await session.flush()
    for i, name in enumerate(skill_names):
        session.add(
            VacancySkill(
                vacancy_id=v.id,
                skill_id=skills_by_name[name].id,
                weight=max(1, 5 - i),
                is_required=i < 2,
            )
        )


DEMO_INTERVIEW_TITLE = "Python dasturchi (intervyu namunasi)"
# Shares Python with the vacancy above: finish that one first, and here only FastAPI is left.
DEMO_REUSE_TITLE = "Backend dasturchi (qayta foydalanish namunasi)"
DEMO_RUBRIC = {
    "criteria": [
        {"key": "accuracy", "name": "Aniqlik", "max_points": 5},
        {"key": "depth", "name": "Chuqurlik", "max_points": 5},
    ]
}
DEMO_QUESTIONS = [
    (
        "FastAPI'da dependency injection qanday ishlaydi?",
        2,
        "Depends so'rov vaqtida obyekt beradi.",
    ),
    (
        "PostgreSQL'da indeks qachon foyda bermaydi?",
        3,
        "Kichik jadval yoki kam tanlanuvchan ustun.",
    ),
    ("Python'da list va tuple farqi nimada?", 1, "List o'zgaradi, tuple o'zgarmaydi."),
    ("REST API'da idempotentlik nima degani?", 3, "Takroriy so'rov natijani o'zgartirmaydi."),
    (
        "Tranzaksiya izolyatsiya darajalarini tushuntiring.",
        4,
        "Read committed, serializable va h.k.",
    ),
    (
        "Python'da GIL nima va nimaga ta'sir qiladi?",
        4,
        "Bir vaqtda bitta thread bytecode bajaradi.",
    ),
    (
        "N+1 so'rov muammosi nima va u qanday hal qilinadi?",
        3,
        "Bog'liq ma'lumotni oldindan yuklash.",
    ),
    ("Keshni qachon bekor qilish kerak?", 5, "Manba o'zgarganda yoki muddati tugaganda."),
]


async def _demo_interview(
    session: AsyncSession,
    company: Company,
    hr: User,
    skills_by_name: dict[str, Skill],
    now: datetime,
    title: str = DEMO_INTERVIEW_TITLE,
    skill_names: tuple[str, ...] = ("Python", "PostgreSQL"),
    task_skills: tuple[str, ...] = ("Python",),
) -> None:
    """A vacancy that is ready to interview on, so both stages can be tried right after a seed."""
    existing = await session.scalar(select(Vacancy.id).where(Vacancy.title == title))
    if existing is not None:
        # Seeded before tasks had a skill: without one, the task can never be reused.
        config = await session.scalar(
            select(Assessment.stage1_config).where(Assessment.vacancy_id == existing)
        )
        if config and len(config.get("task_ids", [])) == 1 and task_skills[0] in skills_by_name:
            await session.execute(
                update(PracticalTask)
                .where(
                    PracticalTask.id == uuid.UUID(str(config["task_ids"][0])),
                    PracticalTask.skill_id.is_(None),
                )
                .values(skill_id=skills_by_name[task_skills[0]].id)
            )
        return
    names = [n for n in skill_names if n in skills_by_name]
    vacancy = Vacancy(
        company_id=company.id,
        title=title,
        description="Ikki bosqichli intervyuni sinab ko'rish uchun namunaviy vakansiya.",
        requirements="Python asoslari",
        profession_area="it",
        country="UZ",
        region_code="UZ-TK",
        remote_type=RemoteType.remote,
        employment_type=EmploymentType.full_time,
        experience_level=ExperienceLevel.between_1_3,
        currency="UZS",
        status=VacancyStatus.published,
        published_at=now,
        created_by=hr.id,
        skills_text=" ".join(names),
    )
    session.add(vacancy)
    await session.flush()
    for name in names:
        session.add(VacancySkill(vacancy_id=vacancy.id, skill_id=skills_by_name[name].id, weight=3))
    tasks = [
        PracticalTask(
            company_id=company.id,
            title=f"Ikki son yig'indisi ({name})",
            skill_id=skills_by_name[name].id if name in skills_by_name else None,
            statement="Bir qatorda ikkita butun son beriladi. Ularning yig'indisini chiqaring.",
            allowed_languages=["python"],
            starter_code={"python": "a, b = map(int, input().split())\n"},
            visible_tests=[{"name": "misol", "input": "2 3\n", "output": "5"}],
            hidden_tests=[{"name": "manfiy", "input": "-1 1\n", "output": "0"}],
            rubric=DEMO_RUBRIC,
            reference_solution={
                "language": "python",
                "code": "print(sum(map(int, input().split())))",
            },
            language="uz",
            is_approved=True,
            created_by=hr.id,
        )
        for name in task_skills
    ]
    session.add_all(tasks)
    assessment = Assessment(
        vacancy_id=vacancy.id,
        language="uz",
        stage1_config={},
        stage2_config={"question_count": len(DEMO_QUESTIONS), "mode": "voice", "adaptive": True},
    )
    session.add(assessment)
    await session.flush()
    assessment.stage1_config = {"task_ids": [str(task.id) for task in tasks]}
    skill_ids: list[uuid.UUID | None] = [skills_by_name[n].id for n in names] or [None]
    for i, (text, difficulty, reference) in enumerate(DEMO_QUESTIONS):
        question = Question(
            company_id=company.id,
            type=QuestionType.open,
            text=text,
            correct_answer=None,
            difficulty=difficulty,
            language="uz",
            skill_id=skill_ids[i % len(skill_ids)],
            rubric=DEMO_RUBRIC,
            reference_answer=reference,
            is_approved=True,
            created_by=hr.id,
        )
        session.add(question)
        await session.flush()
        session.add(
            AssessmentQuestion(assessment_id=assessment.id, question_id=question.id, order=i)
        )


async def seed(bulk: int = 0) -> None:
    settings = get_settings()
    if settings.environment not in ("local", "test"):
        raise SystemExit("Demo seed only runs in local/test environments")
    rng = random.Random(2026)
    now = datetime.now(UTC)
    async with SessionLocal() as session:
        skills_by_name = {s.name: s for s in await session.scalars(select(Skill))}
        demo_hr = await _user(session, DEMO_HR_EMAIL, "Dilnoza Rahimova", UserRole.hr)
        candidate = await _user(session, DEMO_CANDIDATE_EMAIL, "Aziz Karimov", UserRole.candidate)
        if await session.get(CandidateProfile, candidate.id) is None:
            session.add(
                CandidateProfile(
                    user_id=candidate.id,
                    headline="Python backend dasturchi",
                    country="UZ",
                    city="Toshkent",
                    experience_years=3,
                    about="FastAPI, PostgreSQL va Docker bilan 3 yillik tajriba.",
                    desired_salary_min=15_000_000,
                    desired_salary_max=22_000_000,
                    currency="UZS",
                    open_to_work=True,
                )
            )
        created = 0
        for idx, (name, slug, region, about, verified) in enumerate(COMPANIES):
            if await session.scalar(select(Company.id).where(Company.slug == slug)):
                continue
            company = Company(
                name=name,
                slug=slug,
                description=about,
                industry="IT",
                country="UZ",
                city=None,
                is_verified=verified,
                website=f"https://{slug}.uz",
            )
            session.add(company)
            await session.flush()
            owner = (
                demo_hr
                if idx == 0
                else await _user(session, f"hr+{slug}@example.com", f"HR {name}", UserRole.hr)
            )
            session.add(
                CompanyMember(company_id=company.id, user_id=owner.id, member_role=MemberRole.owner)
            )
            for role in rng.sample(ROLES, k=rng.randint(5, 9)):
                published = now - timedelta(hours=rng.randint(1, 24 * 30))
                await _vacancy(
                    session, rng, company, region, role, skills_by_name, published, owner
                )
                created += 1
        await session.commit()

        owner_company = await session.scalar(
            select(Company)
            .join(CompanyMember, CompanyMember.company_id == Company.id)
            .where(CompanyMember.user_id == demo_hr.id)
        )
        if owner_company is not None:
            await _demo_interview(session, owner_company, demo_hr, skills_by_name, now)
            await _demo_interview(
                session,
                owner_company,
                demo_hr,
                skills_by_name,
                now,
                title=DEMO_REUSE_TITLE,
                skill_names=("Python", "FastAPI"),
                task_skills=("Python", "FastAPI"),
            )
            await session.commit()

        if bulk:
            companies = list(await session.scalars(select(Company)))
            regions = ["UZ-TK", "UZ-TK", "UZ-TO", "UZ-SA", "UZ-BU", "UZ-AN", "UZ-FA", "UZ-NG"]
            for i in range(bulk):
                await _vacancy(
                    session,
                    rng,
                    rng.choice(companies),
                    rng.choice(regions),
                    rng.choice(ROLES),
                    skills_by_name,
                    now - timedelta(minutes=rng.randint(1, 60 * 24 * 90)),
                    demo_hr,
                )
                if i % 500 == 499:
                    await session.commit()
            await session.commit()
    await engine.dispose()
    print(f"seed: {created} demo vacancies, {bulk} bulk vacancies")
    print(
        f"demo HR: {DEMO_HR_EMAIL} / candidate: {DEMO_CANDIDATE_EMAIL} / password: {DEMO_PASSWORD}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bulk", type=int, default=0)
    asyncio.run(seed(parser.parse_args().bulk))


if __name__ == "__main__":
    main()
