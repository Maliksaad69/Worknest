import os
from supabase import create_client

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)
TABLE_NAME = os.environ.get("TABLE_NAME", "users")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

response = supabase.table(TABLE_NAME).select("*").execute()

if not response.data:
    print(f"Table '{TABLE_NAME}' is empty (0 rows).")
else:
    for row in response.data:
        print(row)
