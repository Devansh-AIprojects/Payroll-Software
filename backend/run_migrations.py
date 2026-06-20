import asyncio
import os
import asyncpg
from dotenv import load_dotenv

async def main():
    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found")
        return

    # Add sslmode=require for Supabase
    if "?" not in db_url:
        db_url += "?sslmode=require"
    else:
        db_url += "&sslmode=require"
        
    print(f"Connecting to DB...")
    conn = await asyncpg.connect(db_url)
    print("Connected.")

    migrations_dir = "../db/migrations"
    seeds_dir = "../db/seeds"



    seed_files = sorted([f for f in os.listdir(seeds_dir) if f.endswith('.sql')])
    for file in seed_files:
        filepath = os.path.join(seeds_dir, file)
        print(f"Running seed: {file}")
        with open(filepath, 'r', encoding='utf-8') as f:
            sql = f.read()
        await conn.execute(sql)

    print("All migrations and seeds applied successfully.")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
