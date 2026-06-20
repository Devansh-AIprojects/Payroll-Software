import asyncio
from app.database import get_connection

async def update_constraints():
    async with get_connection() as c:
        # Update employees table constraint
        await c.execute("""
            ALTER TABLE employees 
            DROP CONSTRAINT employees_payment_mode_check,
            ADD CONSTRAINT employees_payment_mode_check CHECK (payment_mode IN ('bank', 'cash', 'bank_cash'));
        """)
        
        # Update payroll_records table constraint
        await c.execute("""
            ALTER TABLE payroll_records 
            DROP CONSTRAINT payroll_records_payment_mode_check,
            ADD CONSTRAINT payroll_records_payment_mode_check CHECK (payment_mode IN ('bank', 'cash', 'bank_cash'));
        """)
        print("Constraints updated successfully.")

if __name__ == "__main__":
    asyncio.run(update_constraints())
