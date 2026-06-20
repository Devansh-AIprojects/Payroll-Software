import asyncio, asyncpg, os
from dotenv import load_dotenv
load_dotenv()

async def apply():
    db_url = os.getenv('DATABASE_URL')
    if '?' not in db_url:
        db_url += '?sslmode=require'
    else:
        db_url += '&sslmode=require'
    conn = await asyncpg.connect(db_url)
    
    sql = open('../db/migrations/014_phase7_fields.sql').read()
    await conn.execute(sql)
    print('Migration 014 applied.')
    
    # Verify
    rows = await conn.fetch(
        "SELECT column_name FROM information_schema.columns WHERE table_name='employees' ORDER BY ordinal_position"
    )
    print('Columns now:', [r['column_name'] for r in rows])
    await conn.close()

if __name__ == '__main__':
    asyncio.run(apply())
