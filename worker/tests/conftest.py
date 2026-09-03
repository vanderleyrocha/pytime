"""Fixtures do worker: conexão e unidade descartável no banco remoto."""

import os
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row


@pytest.fixture(scope="session")
def db_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        pytest.skip("SUPABASE_DB_URL não definida (testes usam o banco de dev)")
    return url


@pytest.fixture()
def conexao(db_url):
    with psycopg.connect(db_url, autocommit=True, row_factory=dict_row) as conn:
        yield conn


@pytest.fixture()
def unidade_teste(conexao):
    """Unidade descartável; o delete em cascata limpa tudo que os testes criarem."""
    unidade_id = str(uuid.uuid4())
    with conexao.cursor() as cur:
        cur.execute(
            "insert into unidades (id, nome) values (%s, %s)",
            (unidade_id, f"Teste Worker {unidade_id[:8]}"),
        )
    yield unidade_id
    with conexao.cursor() as cur:
        cur.execute("delete from unidades where id = %s", (unidade_id,))
