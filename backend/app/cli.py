"""Ops commands: `python -m app.cli create-admin EMAIL "Full Name"` (password from stdin)."""

import asyncio
import getpass
import sys

from sqlalchemy import select

from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import User
from app.models.enums import UserRole


async def create_admin(email: str, name: str, password: str) -> None:
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            user = User(
                email=email.lower(),
                full_name=name,
                password_hash=hash_password(password),
                role=UserRole.admin,
                is_email_verified=True,
            )
            session.add(user)
        else:
            user.role = UserRole.admin
        await session.commit()
    await engine.dispose()
    print(f"admin ready: {email.lower()}")


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] != "create-admin":
        raise SystemExit(__doc__)
    password = getpass.getpass("Password: ") if sys.stdin.isatty() else sys.stdin.readline().strip()
    if len(password) < 12:
        raise SystemExit("Admin password must be at least 12 characters")
    asyncio.run(create_admin(sys.argv[2], sys.argv[3], password))


if __name__ == "__main__":
    main()
