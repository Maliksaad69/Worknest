#!/usr/bin/env python3
"""
Database Table Printer Script
=============================
This script connects to a database (PostgreSQL / Supabase / SQLite)
and prints the contents of a target table in a nicely formatted table.

Designed for automated daily cron jobs (e.g. GitHub Actions) or local CLI use.

Usage:
    python scripts/print_table.py
    python scripts/print_table.py --table users --limit 20
    python scripts/print_table.py --table worknest_state --format github
    python scripts/print_table.py --demo
"""

import argparse
import csv
import io
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# Try loading .env file if available
try:
    from dotenv import load_dotenv

    load_dotenv()
    load_dotenv(".env.local")
except ImportError:
    pass

# Try importing tabulate for pretty table output
try:
    from tabulate import tabulate

    HAS_TABULATE = True
except ImportError:
    HAS_TABULATE = False

# Try importing psycopg2 for PostgreSQL connections
try:
    import psycopg2
    from psycopg2 import sql

    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

# Try importing requests for Supabase REST fallback
try:
    import requests

    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# Built-in SQLite
import sqlite3


def is_valid_identifier(name: str) -> bool:
    """Validate SQL identifier (table/column name) to avoid injection."""
    return bool(re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name))


def format_cell_value(val: Any, max_len: int = 50) -> str:
    """Format a cell value for clean terminal display."""
    if val is None:
        return "NULL"
    if isinstance(val, (dict, list)):
        s = json.dumps(val)
    elif isinstance(val, (datetime,)):
        s = val.isoformat()
    elif isinstance(val, bytes):
        s = f"\\x{val.hex()[:16]}..."
    else:
        s = str(val)

    # Truncate newlines to keep table rows single-line
    s = s.replace("\r", "").replace("\n", " ")

    if len(s) > max_len:
        return s[: max_len - 3] + "..."
    return s


def print_formatted_data(
    headers: List[str],
    rows: List[List[Any]],
    fmt: str = "grid",
    max_col_width: int = 50,
) -> None:
    """Print the extracted data in the specified format."""
    if fmt == "json":
        data = [
            {headers[i]: row[i] for i in range(len(headers))} for row in rows
        ]
        print(json.dumps(data, indent=2, default=str))
        return

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)
        print(output.getvalue(), end="")
        return

    # Terminal table format
    formatted_rows = [
        [format_cell_value(cell, max_col_width) for cell in row]
        for row in rows
    ]

    if HAS_TABULATE:
        print(tabulate(formatted_rows, headers=headers, tablefmt=fmt))
    else:
        # Fallback if tabulate is not installed
        col_widths = [len(h) for h in headers]
        for row in formatted_rows:
            for idx, cell in enumerate(row):
                col_widths[idx] = max(col_widths[idx], len(cell))

        header_line = " | ".join(
            h.ljust(col_widths[i]) for i, h in enumerate(headers)
        )
        separator = "-+-".join("-" * col_widths[i] for i in range(len(headers)))
        print(header_line)
        print(separator)
        for row in formatted_rows:
            print(
                " | ".join(
                    cell.ljust(col_widths[i]) for i, cell in enumerate(row)
                )
            )


def query_postgresql(
    connection_string: str,
    table: str,
    columns: List[str],
    limit: int,
    order_by: Optional[str] = None,
) -> Tuple[List[str], List[List[Any]]]:
    """Execute query against PostgreSQL using psycopg2."""
    if not HAS_PSYCOPG2:
        raise RuntimeError(
            "psycopg2 is not installed. Please run: pip install psycopg2-binary"
        )

    # Ensure sslmode for cloud databases if not already present
    dsn = connection_string
    if (
        ("supabase.co" in dsn or "neon.tech" in dsn or "aws.com" in dsn)
        and "sslmode=" not in dsn
    ):
        separator = "&" if "?" in dsn else "?"
        dsn = f"{dsn}{separator}sslmode=require"

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            # Build safe query
            if columns == ["*"]:
                cols_clause = sql.SQL("*")
            else:
                cols_clause = sql.SQL(", ").join([sql.Identifier(c) for c in columns])

            query = sql.SQL("SELECT {cols} FROM {tbl}").format(
                cols=cols_clause,
                tbl=sql.Identifier(table),
            )

            if order_by and is_valid_identifier(order_by.split()[0]):
                parts = order_by.split()
                direction = "DESC" if len(parts) > 1 and parts[1].upper() == "DESC" else "ASC"
                query += sql.SQL(" ORDER BY {col} {dir}").format(
                    col=sql.Identifier(parts[0]),
                    dir=sql.SQL(direction),
                )

            query += sql.SQL(" LIMIT %s")
            cur.execute(query, (limit,))

            headers = [desc[0] for desc in cur.description]
            rows = [list(r) for r in cur.fetchall()]
            return headers, rows
    finally:
        conn.close()


def query_supabase_rest(
    supabase_url: str,
    supabase_key: str,
    table: str,
    columns: List[str],
    limit: int,
    order_by: Optional[str] = None,
) -> Tuple[List[str], List[List[Any]]]:
    """Query Supabase via its PostgREST API."""
    if not HAS_REQUESTS:
        raise RuntimeError(
            "requests is not installed. Please run: pip install requests"
        )

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table}"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Accept": "application/json",
    }
    params: Dict[str, Any] = {
        "select": ",".join(columns),
        "limit": limit,
    }
    if order_by:
        parts = order_by.split()
        direction = "desc" if len(parts) > 1 and parts[1].lower() == "desc" else "asc"
        params["order"] = f"{parts[0]}.{direction}"

    response = requests.get(endpoint, headers=headers, params=params, timeout=15)
    if response.status_code != 200:
        raise RuntimeError(
            f"Supabase REST error ({response.status_code}): {response.text}"
        )

    data = response.json()
    if not data:
        return (columns if columns != ["*"] else ["id"]), []

    headers_list = list(data[0].keys())
    rows = [[item.get(h) for h in headers_list] for item in data]
    return headers_list, rows


def query_sqlite(
    db_path: str,
    table: str,
    columns: List[str],
    limit: int,
    order_by: Optional[str] = None,
) -> Tuple[List[str], List[List[Any]]]:
    """Execute query against SQLite database."""
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        col_clause = "*" if columns == ["*"] else ", ".join(f'"{c}"' for c in columns)
        query = f'SELECT {col_clause} FROM "{table}"'
        if order_by:
            parts = order_by.split()
            direction = "DESC" if len(parts) > 1 and parts[1].upper() == "DESC" else "ASC"
            query += f' ORDER BY "{parts[0]}" {direction}'
        query += f" LIMIT {limit}"

        cur.execute(query)
        headers = [desc[0] for desc in cur.description]
        rows = [list(r) for r in cur.fetchall()]
        return headers, rows
    finally:
        conn.close()


def generate_demo_table() -> Tuple[List[str], List[List[Any]]]:
    """Return a demo sample table for dry-runs or initial testing."""
    headers = ["id", "name", "role", "email", "status", "last_active"]
    rows = [
        [1, "Ada Lovelace", "admin", "ada@example.com", "active", "2026-10-20 09:15:00"],
        [2, "Alan Turing", "member", "alan@example.com", "active", "2026-10-20 14:30:22"],
        [3, "Grace Hopper", "admin", "grace@example.com", "active", "2026-10-21 00:01:10"],
        [4, "Claude Shannon", "guest", "claude@example.com", "idle", "2026-10-18 18:42:05"],
        [5, "Margaret Hamilton", "admin", "margaret@example.com", "active", "2026-10-20 22:11:45"],
    ]
    return headers, rows


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Daily Database Table Viewer for GitHub Actions and CLI"
    )
    parser.add_argument(
        "--table",
        "-t",
        default=os.getenv("TABLE_NAME", "users"),
        help="Name of the table to inspect (default: users, or $TABLE_NAME)",
    )
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        default=int(os.getenv("TABLE_LIMIT", "50")),
        help="Maximum rows to fetch (default: 50, or $TABLE_LIMIT)",
    )
    parser.add_argument(
        "--columns",
        "-c",
        default="*",
        help="Comma-separated column names to fetch (default: *)",
    )
    parser.add_argument(
        "--order-by",
        default=os.getenv("ORDER_BY"),
        help="Column to order by (e.g. 'id DESC' or 'createdAt DESC')",
    )
    parser.add_argument(
        "--format",
        "-f",
        default=os.getenv("OUTPUT_FORMAT", "grid"),
        choices=["grid", "github", "psql", "simple", "plain", "json", "csv"],
        help="Output format (default: grid)",
    )
    parser.add_argument(
        "--max-col-width",
        type=int,
        default=50,
        help="Maximum width of individual columns before truncation (default: 50)",
    )
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DATABASE_URL"),
        help="PostgreSQL connection string (or $DATABASE_URL / $SUPABASE_DATABASE_URL)",
    )
    parser.add_argument(
        "--sqlite",
        default=os.getenv("SQLITE_DB"),
        help="Path to SQLite database file (or $SQLITE_DB)",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run in demo mode with sample records",
    )

    args = parser.parse_args()

    # Validate table name
    if not is_valid_identifier(args.table):
        print(f"[-] Invalid table name: {args.table!r}. Must be alphanumeric.", file=sys.stderr)
        sys.exit(1)

    # Parse columns
    if args.columns == "*":
        cols = ["*"]
    else:
        cols = [c.strip() for c in args.columns.split(",") if c.strip()]
        for c in cols:
            if not is_valid_identifier(c):
                print(f"[-] Invalid column name: {c!r}.", file=sys.stderr)
                sys.exit(1)

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    print("=" * 70)
    print(" 📊 WORKNEST DATABASE TABLE REPORT")
    print("=" * 70)
    print(f" • Timestamp : {now_utc}")
    print(f" • Target    : Table '{args.table}' (Limit: {args.limit})")

    # Precedence order:
    # 1. --demo flag
    # 2. Explicit --sqlite argument
    # 3. Explicit --db-url argument
    # 4. DATABASE_URL / SUPABASE_DATABASE_URL environment variable (PostgreSQL)
    # 5. SUPABASE_URL & SUPABASE_KEY environment variables (Supabase REST API)
    # 6. SQLITE_DB environment variable (SQLite)
    # 7. Informative fallback / demo notice

    # Mode 1: Explicit Demo Mode
    if args.demo:
        print(" • Mode      : DEMO / SAMPLE DATA")
        print("=" * 70)
        headers, rows = generate_demo_table()
        print_formatted_data(headers, rows, fmt=args.format, max_col_width=args.max_col_width)
        print(f"\n✔ Total rows displayed: {len(rows)}\n")
        return

    # Mode 2: Explicit SQLite DB via argument
    if args.sqlite and os.path.exists(args.sqlite):
        print(f" • Source    : SQLite ({args.sqlite})")
        print("=" * 70)
        try:
            headers, rows = query_sqlite(
                db_path=args.sqlite,
                table=args.table,
                columns=cols,
                limit=args.limit,
                order_by=args.order_by,
            )
            if not rows:
                print(f"\n[i] Table '{args.table}' is currently empty (0 rows).\n")
            else:
                print_formatted_data(headers, rows, fmt=args.format, max_col_width=args.max_col_width)
                print(f"\n✔ Total rows fetched: {len(rows)}\n")
            return
        except Exception as e:
            print(f"[-] SQLite query failed: {e}", file=sys.stderr)
            sys.exit(1)

    # Mode 3: Direct PostgreSQL Connection
    db_url = args.db_url
    if db_url:
        masked_url = re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", db_url)
        print(f" • Source    : PostgreSQL ({masked_url})")
        print("=" * 70)
        try:
            headers, rows = query_postgresql(
                connection_string=db_url,
                table=args.table,
                columns=cols,
                limit=args.limit,
                order_by=args.order_by,
            )
            if not rows:
                print(f"\n[i] Table '{args.table}' is currently empty (0 rows).\n")
            else:
                print_formatted_data(headers, rows, fmt=args.format, max_col_width=args.max_col_width)
                print(f"\n✔ Total rows fetched: {len(rows)}\n")
            return
        except Exception as e:
            print(f"[-] PostgreSQL query failed: {e}", file=sys.stderr)
            sys.exit(1)

    # Mode 4: Supabase REST API
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("SUPABASE_PUBBLISHABLE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )

    if supabase_url and supabase_key:
        print(f" • Source    : Supabase REST API ({supabase_url})")
        print("=" * 70)
        try:
            headers, rows = query_supabase_rest(
                supabase_url=supabase_url,
                supabase_key=supabase_key,
                table=args.table,
                columns=cols,
                limit=args.limit,
                order_by=args.order_by,
            )
            if not rows:
                print(f"\n[i] Table '{args.table}' is currently empty (0 rows).\n")
            else:
                print_formatted_data(headers, rows, fmt=args.format, max_col_width=args.max_col_width)
                print(f"\n✔ Total rows fetched: {len(rows)}\n")
            return
        except Exception as e:
            print(f"[-] Supabase REST query failed: {e}", file=sys.stderr)
            sys.exit(1)

    # Mode 5: SQLite Database from environment variable
    sqlite_env = os.getenv("SQLITE_DB")
    if sqlite_env and os.path.exists(sqlite_env):
        print(f" • Source    : SQLite ({sqlite_env})")
        print("=" * 70)
        try:
            headers, rows = query_sqlite(
                db_path=sqlite_env,
                table=args.table,
                columns=cols,
                limit=args.limit,
                order_by=args.order_by,
            )
            if not rows:
                print(f"\n[i] Table '{args.table}' is currently empty (0 rows).\n")
            else:
                print_formatted_data(headers, rows, fmt=args.format, max_col_width=args.max_col_width)
                print(f"\n✔ Total rows fetched: {len(rows)}\n")
            return
        except Exception as e:
            print(f"[-] SQLite query failed: {e}", file=sys.stderr)
            sys.exit(1)

    # Fallback when no database credentials are configured
    print(" • Source    : NO DATABASE CREDENTIALS CONFIGURED")
    print("=" * 70)
    print("\n[!] No database connection found in environment or arguments.")
    print("    To connect your database, set one of the following:")
    print("      • DATABASE_URL or SUPABASE_DATABASE_URL (for PostgreSQL)")
    print("      • SUPABASE_URL and SUPABASE_ANON_KEY (for Supabase REST)")
    print("      • SQLITE_DB or --sqlite <path> (for SQLite)")
    print("      • Or pass --demo to see sample output.\n")
    print("Displaying demo table output for preview:")
    headers, rows = generate_demo_table()
    print_formatted_data(headers, rows, fmt=args.format, max_col_width=args.max_col_width)
    print(f"\n✔ Demo rows displayed: {len(rows)}\n")


if __name__ == "__main__":
    main()
