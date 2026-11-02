import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbSession
from app.models import PracticalTask, Question
from app.models.enums import ItemSource
from app.schemas.assessment import (
    AssessmentIn,
    AssessmentOut,
    GenerateIn,
    GenerationJobOut,
    Page,
    QuestionIn,
    QuestionOut,
    TaskIn,
    TaskOut,
)
from app.services import assessments, bank
from app.services.bank import Item
from app.workers.queue import ArqJobQueue, get_job_queue

router = APIRouter(tags=["assessments"])
PageNo = Annotated[int, Query(ge=1, le=1000)]
PageSize = Annotated[int, Query(ge=1, le=100)]
Queue = Annotated[ArqJobQueue, Depends(get_job_queue)]


class ApproveIn(BaseModel):
    approved: bool = True


def _bank_routes(prefix: str, scoped: bool) -> None:
    """Registers question/task CRUD under a company prefix or the admin template prefix."""

    def cid(company_id: uuid.UUID | None) -> uuid.UUID | None:
        return company_id if scoped else None

    for kind, model, schema_in, schema_out in (
        ("questions", Question, QuestionIn, QuestionOut),
        ("tasks", PracticalTask, TaskIn, TaskOut),
    ):
        _register(prefix, kind, model, schema_in, schema_out, cid)


def _register(prefix, kind, model, schema_in, schema_out, cid):
    async def list_(
        user: CurrentUser,
        session: DbSession,
        company_id: uuid.UUID | None = None,
        include_global: bool = False,
        skill_id: uuid.UUID | None = None,
        approved: bool | None = None,
        source: ItemSource | None = None,
        q: Annotated[str | None, Query(max_length=200)] = None,
        page: PageNo = 1,
        page_size: PageSize = 20,
    ):
        items, total = await bank.list_items(
            session,
            model,
            cid(company_id),
            user,
            include_global=include_global,
            skill_id=skill_id,
            approved=approved,
            source=source,
            q=q,
            page=page,
            size=page_size,
        )
        return Page[schema_out](
            items=[bank.to_out(i) for i in items], total=total, page=page, page_size=page_size
        )

    async def create(
        data: schema_in, user: CurrentUser, session: DbSession, company_id: uuid.UUID | None = None
    ):
        fn = bank.create_question if model is Question else bank.create_task
        return await fn(session, cid(company_id), user, data)

    async def read(
        item_id: uuid.UUID,
        user: CurrentUser,
        session: DbSession,
        company_id: uuid.UUID | None = None,
    ):
        return bank.to_out(await bank.get_item(session, model, cid(company_id), item_id, user))

    async def replace(
        item_id: uuid.UUID,
        data: schema_in,
        user: CurrentUser,
        session: DbSession,
        company_id: uuid.UUID | None = None,
    ):
        item: Item = await bank.update_item(session, model, cid(company_id), item_id, user, data)
        return bank.to_out(item)

    async def approve(
        item_id: uuid.UUID,
        body: ApproveIn,
        user: CurrentUser,
        session: DbSession,
        company_id: uuid.UUID | None = None,
    ):
        item = await bank.set_approved(
            session, model, cid(company_id), item_id, user, body.approved
        )
        return bank.to_out(item)

    async def remove(
        item_id: uuid.UUID,
        user: CurrentUser,
        session: DbSession,
        company_id: uuid.UUID | None = None,
    ) -> None:
        await bank.delete_item(session, model, cid(company_id), item_id, user)

    base = f"{prefix}/{kind}"
    name = f"{'company' if '{company_id}' in prefix else 'template'}_{kind}"
    router.add_api_route(
        base, list_, methods=["GET"], response_model=Page[schema_out], name=f"list_{name}"
    )
    router.add_api_route(
        base,
        create,
        methods=["POST"],
        response_model=schema_out,
        status_code=status.HTTP_201_CREATED,
        name=f"create_{name}",
    )
    router.add_api_route(
        f"{base}/{{item_id}}", read, methods=["GET"], response_model=schema_out, name=f"get_{name}"
    )
    router.add_api_route(
        f"{base}/{{item_id}}",
        replace,
        methods=["PUT"],
        response_model=schema_out,
        name=f"update_{name}",
    )
    router.add_api_route(
        f"{base}/{{item_id}}/approve",
        approve,
        methods=["POST"],
        response_model=schema_out,
        name=f"approve_{name}",
    )
    router.add_api_route(
        f"{base}/{{item_id}}",
        remove,
        methods=["DELETE"],
        status_code=status.HTTP_204_NO_CONTENT,
        name=f"delete_{name}",
    )


_bank_routes("/companies/{company_id}", scoped=True)
_bank_routes("/admin/templates", scoped=False)

ASSESSMENT = "/companies/{company_id}/vacancies/{vacancy_id}/assessment"


@router.get(ASSESSMENT, response_model=AssessmentOut)
async def get_assessment(
    company_id: uuid.UUID, vacancy_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> AssessmentOut:
    return await assessments.get(session, company_id, vacancy_id, user)


@router.put(ASSESSMENT, response_model=AssessmentOut)
async def put_assessment(
    company_id: uuid.UUID,
    vacancy_id: uuid.UUID,
    data: AssessmentIn,
    user: CurrentUser,
    session: DbSession,
) -> AssessmentOut:
    return await assessments.upsert(session, company_id, vacancy_id, user, data)


@router.post(
    f"{ASSESSMENT}/generate", response_model=GenerationJobOut, status_code=status.HTTP_202_ACCEPTED
)
async def generate(
    company_id: uuid.UUID,
    vacancy_id: uuid.UUID,
    data: GenerateIn,
    user: CurrentUser,
    session: DbSession,
    queue: Queue,
) -> GenerationJobOut:
    job = await assessments.start_generation(session, company_id, vacancy_id, user, data, queue)
    return GenerationJobOut.model_validate(job, from_attributes=True)


@router.get("/companies/{company_id}/generation-jobs/{job_id}", response_model=GenerationJobOut)
async def get_job(
    company_id: uuid.UUID, job_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> GenerationJobOut:
    job = await assessments.get_job(session, company_id, job_id, user)
    return GenerationJobOut.model_validate(job, from_attributes=True)
