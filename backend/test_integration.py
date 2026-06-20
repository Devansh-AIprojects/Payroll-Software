import asyncio
import httpx
from datetime import date, timedelta

BASE_URL = "http://127.0.0.1:8000"

async def test_integration():
    async with httpx.AsyncClient() as client:
        # 1. Login to get JWT token
        print("Logging in...")
        resp = await client.post(f"{BASE_URL}/api/v1/auth/login", json={"email": "admin@stccotyarn.com", "password": "changeme123"})
        if resp.status_code != 200:
            print(f"Login failed: {resp.text}")
            return
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Trigger attendance processing
        print("Triggering attendance processing...")
        start = (date.today() - timedelta(days=1)).isoformat()
        end = date.today().isoformat()
        req_body = {"from_date": start, "to_date": end}
        resp = await client.post(f"{BASE_URL}/attendance/process", json=req_body, headers=headers)
        print(f"Process response ({resp.status_code}): {resp.text}")

        # 3. Check exceptions list
        print("Fetching exceptions list...")
        resp = await client.get(f"{BASE_URL}/attendance/exceptions", params={"year": date.today().year, "month": date.today().month}, headers=headers)
        print(f"Exceptions response ({resp.status_code}): {resp.text}")

if __name__ == "__main__":
    asyncio.run(test_integration())
