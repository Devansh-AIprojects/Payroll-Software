import asyncio, asyncpg, os
from dotenv import load_dotenv
load_dotenv()

async def check():
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    rows = await conn.fetch(
        "SELECT column_name FROM information_schema.columns WHERE table_name='employees' ORDER BY ordinal_position"
    )
    for r in rows:
        print(r['column_name'])
    await conn.close()

asyncio.run(check())
