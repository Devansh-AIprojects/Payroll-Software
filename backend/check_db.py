import asyncio
from app.database import get_connection

async def check():
    async with get_connection() as c:
        rows = await c.fetch("SELECT employee_code, name, is_active FROM employees ORDER BY employee_code")
        for r in rows:
            print(f"  {r['employee_code']} | {r['name']} | active={r['is_active']}")
        print(f"\nTotal: {len(rows)}")

asyncio.run(check())
