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
    
    sql = open('../db/migrations/015_payroll_jobber.sql').read()
    await conn.execute(sql)
    print('Migration 015 applied.')
    await conn.close()

if __name__ == '__main__':
    asyncio.run(apply())
