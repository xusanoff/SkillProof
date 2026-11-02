"""Reference data loaded by migrations: regions, profession areas, skills dictionary.

Names are data (spec §1.1). Adding a region or skill = a new migration calling upsert_reference.
"""

import uuid
from typing import Any

from sqlalchemy import Connection
from sqlalchemy.dialects.postgresql import insert

REGIONS: list[tuple[str, str, str, str]] = [
    ("UZ-TK", "Toshkent shahri", "Ташкент", "Tashkent city"),
    ("UZ-TO", "Toshkent viloyati", "Ташкентская область", "Tashkent region"),
    ("UZ-SA", "Samarqand", "Самарканд", "Samarkand"),
    ("UZ-BU", "Buxoro", "Бухара", "Bukhara"),
    ("UZ-AN", "Andijon", "Андижан", "Andijan"),
    ("UZ-FA", "Farg'ona", "Фергана", "Fergana"),
    ("UZ-NG", "Namangan", "Наманган", "Namangan"),
    ("UZ-QA", "Qashqadaryo", "Кашкадарья", "Kashkadarya"),
    ("UZ-SU", "Surxondaryo", "Сурхандарья", "Surkhandarya"),
    ("UZ-JI", "Jizzax", "Джизак", "Jizzakh"),
    ("UZ-SI", "Sirdaryo", "Сырдарья", "Syrdarya"),
    ("UZ-NW", "Navoiy", "Навои", "Navoi"),
    ("UZ-XO", "Xorazm", "Хорезм", "Khorezm"),
    ("UZ-QR", "Qoraqalpog'iston", "Каракалпакстан", "Karakalpakstan"),
]

# Launch is IT-only (spec §1.1), the rest exist so the model stays profession-agnostic.
PROFESSION_AREAS: list[tuple[str, str, str, str]] = [
    ("it", "IT va dasturlash", "IT и разработка", "IT and software"),
    ("data", "Ma'lumotlar va tahlil", "Данные и аналитика", "Data and analytics"),
    ("design", "Dizayn", "Дизайн", "Design"),
    ("sales", "Savdo", "Продажи", "Sales"),
    ("finance", "Moliya va buxgalteriya", "Финансы и бухгалтерия", "Finance and accounting"),
    ("support", "Mijozlarni qo'llab-quvvatlash", "Поддержка клиентов", "Customer support"),
]

SKILLS: dict[str, list[str]] = {
    "language": [
        "Python",
        "JavaScript",
        "TypeScript",
        "Go",
        "Java",
        "Kotlin",
        "C#",
        "PHP",
        "Swift",
        "Dart",
        "SQL",
        "Rust",
        "C++",
    ],
    "backend": [
        "FastAPI",
        "Django",
        "Flask",
        "Node.js",
        "NestJS",
        "Spring Boot",
        ".NET",
        "Laravel",
        "REST API",
        "GraphQL",
        "gRPC",
        "Microservices",
    ],
    "frontend": ["React", "Next.js", "Vue.js", "Angular", "HTML/CSS", "Tailwind CSS", "Redux"],
    "mobile": ["Flutter", "React Native", "Android", "iOS"],
    "data": [
        "PostgreSQL",
        "MySQL",
        "MongoDB",
        "Redis",
        "ClickHouse",
        "Pandas",
        "Power BI",
        "Excel",
        "Machine Learning",
        "Apache Kafka",
        "Elasticsearch",
    ],
    "devops": ["Docker", "Kubernetes", "Linux", "CI/CD", "AWS", "Terraform", "Nginx", "Git"],
    "qa": ["Manual testing", "Selenium", "Playwright", "Postman", "Pytest"],
}


def skill_slug(name: str) -> str:
    replacements = {"#": "sharp", "+": "plus", ".": "", "/": "-", " ": "-"}
    slug = name.lower()
    for old, new in replacements.items():
        slug = slug.replace(old, new)
    return slug.strip("-") or name.lower()


def _names(uz: str, ru: str, en: str) -> dict[str, Any]:
    return {"uz": uz, "ru": ru, "en": en}


def upsert_reference(conn: Connection) -> None:
    from app.models import ProfessionArea, Region, Skill

    rows: list[dict[str, Any]] = [
        {"code": c, "country": "UZ", "names": _names(uz, ru, en), "sort_order": i}
        for i, (c, uz, ru, en) in enumerate(REGIONS)
    ]
    stmt = insert(Region).values(rows)
    conn.execute(
        stmt.on_conflict_do_update(index_elements=["code"], set_={"names": stmt.excluded.names})
    )
    areas = [
        {"slug": s, "names": _names(uz, ru, en), "sort_order": i}
        for i, (s, uz, ru, en) in enumerate(PROFESSION_AREAS)
    ]
    stmt = insert(ProfessionArea).values(areas)
    conn.execute(
        stmt.on_conflict_do_update(index_elements=["slug"], set_={"names": stmt.excluded.names})
    )
    skills = [
        {"id": uuid.uuid4(), "name": n, "slug": skill_slug(n), "category": cat}
        for cat, names in SKILLS.items()
        for n in names
    ]
    conn.execute(insert(Skill).values(skills).on_conflict_do_nothing(index_elements=["slug"]))
