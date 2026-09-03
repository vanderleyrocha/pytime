"""Loop principal: uma iteração processa um job real de ponta a ponta."""

import json
import uuid

from pytime_worker import principal


def test_uma_iteracao_processa_job(conexao, unidade_teste, monkeypatch, db_url):
    monkeypatch.setenv("SUPABASE_DB_URL", db_url)
    geracao_id = str(uuid.uuid4())
    with conexao.cursor() as cur:
        cur.execute(
            "insert into geracoes (id, unidade_id, instancia) values (%s, %s, %s)",
            (geracao_id, unidade_teste, json.dumps({"nada": True})),
        )
    principal.rodar(uma_iteracao=True)
    with conexao.cursor() as cur:
        cur.execute("select status from geracoes where id = %s", (geracao_id,))
        assert cur.fetchone()["status"] == "erro"  # instância inválida


def test_uma_iteracao_com_fila_vazia_nao_quebra(monkeypatch, db_url, conexao):
    monkeypatch.setenv("SUPABASE_DB_URL", db_url)
    principal.rodar(uma_iteracao=True)
