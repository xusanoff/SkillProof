from fastapi import APIRouter

from app.api.v1 import assessments, auth, candidate, companies, interview, vacancies

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(candidate.router)
api_router.include_router(companies.router)
api_router.include_router(vacancies.router)
api_router.include_router(assessments.router)
api_router.include_router(interview.router)
