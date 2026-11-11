import uuid

from httpx import AsyncClient

from tests.conftest import SignUp
from tests.test_job_board import _company, _publish


async def setup(signup: SignUp) -> tuple[AsyncClient, AsyncClient, str, str]:
    hr = await signup("hr")
    candidate = await signup()
    cid = await _company(hr, "Chat Company")
    vacancy = await _publish(hr, cid)
    response = await candidate.post(
        f"/api/v1/vacancies/{vacancy['id']}/apply", json={"cover_note": "Hello HR"}
    )
    assert response.status_code == 201, response.text
    return hr, candidate, cid, response.json()["id"]


async def test_chat_exchange_status_history_and_read_cursors(signup: SignUp) -> None:
    hr, candidate, cid, aid = await setup(signup)
    path = f"/api/v1/chat/threads/{aid}"
    initial = (await candidate.get(f"{path}/messages")).json()
    assert initial["items"][0]["application_status"] == "applied"
    assert initial["thread"]["cover_note"] == "Hello HR"
    token = str(uuid.uuid4())
    body = {"text": "Salary question?", "client_id": token}
    first = await candidate.post(f"{path}/messages", json=body)
    again = await candidate.post(f"{path}/messages", json=body)
    assert first.status_code == 201, first.text
    assert first.json()["id"] == again.json()["id"]
    reply = await hr.post(
        f"{path}/messages", json={"text": "We can discuss it", "client_id": str(uuid.uuid4())}
    )
    assert reply.status_code == 201
    assert (
        await hr.patch(f"/api/v1/companies/{cid}/applications/{aid}", json={"status": "rejected"})
    ).status_code == 200
    rows = (await candidate.get(f"{path}/messages")).json()
    assert rows["items"][-1]["application_status"] == "rejected"
    assert sum(x["text"] == body["text"] for x in rows["items"]) == 1
    assert rows["thread"]["unread_count"] == 3  # applied, HR response, rejection
    latest = rows["items"][-1]["sequence"]
    assert (
        await candidate.post(f"{path}/read", json={"through_sequence": latest})
    ).status_code == 204
    # A stale read acknowledgment cannot move the cursor backwards.
    await candidate.post(f"{path}/read", json={"through_sequence": rows["items"][0]["sequence"]})
    assert (await candidate.get("/api/v1/chat/threads")).json()["items"][0]["unread_count"] == 0
    assert (
        await candidate.post(
            f"{path}/messages",
            json={"text": "Can you share feedback?", "client_id": str(uuid.uuid4())},
        )
    ).status_code == 201
    old = (await candidate.get(f"{path}/messages", params={"before": latest, "limit": 1})).json()
    assert old["has_more"] and old["items"][0]["sequence"] < latest
    new = (await candidate.get(f"{path}/messages", params={"after": latest})).json()
    assert len(new["items"]) == 1


async def test_chat_permissions_and_validation(signup: SignUp, client: AsyncClient) -> None:
    hr, candidate, cid, aid = await setup(signup)
    stranger = await signup()
    other_hr = await signup("hr")
    path = f"/api/v1/chat/threads/{aid}"
    for outsider in (stranger, other_hr):
        assert (await outsider.get(f"{path}/messages")).status_code == 404
        assert (
            await outsider.post(
                f"{path}/messages", json={"text": "secret?", "client_id": str(uuid.uuid4())}
            )
        ).status_code == 404
        assert (
            await outsider.post(f"{path}/read", json={"through_sequence": 1})
        ).status_code == 404
        assert (await outsider.get("/api/v1/chat/threads")).json()["total"] == 0
    assert (await client.get("/api/v1/chat/threads")).status_code == 401
    assert (
        await candidate.get("/api/v1/chat/threads", params={"company_id": cid})
    ).status_code == 403
    for text in (" ", "a" * 4001):
        assert (
            await candidate.post(
                f"{path}/messages", json={"text": text, "client_id": str(uuid.uuid4())}
            )
        ).status_code == 422
    assert (await hr.post(f"{path}/read", json={"through_sequence": 999999})).status_code == 404
    assert (
        await candidate.get(f"{path}/messages", params={"before": 1, "after": 0})
    ).status_code == 422
