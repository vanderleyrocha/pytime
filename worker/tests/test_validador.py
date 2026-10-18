"""Validador da edição manual: autenticação, contrato, cache e HTTP."""

import json
import threading
import urllib.error
import urllib.request

import pytest

from pytime_worker import validador

TOKEN = "segredo-de-teste"


def _instancia() -> dict:
    """Uma turma, um dia, dois horários, duas disciplinas de 1 aula."""
    return {
        "turnos": [{"id": "manha", "nome": "Manhã"}],
        "slots": [
            {"id": "s0", "dia": 0, "ordem": 0, "turno_id": "manha"},
            {"id": "s1", "dia": 0, "ordem": 1, "turno_id": "manha"},
        ],
        "turmas": [{"id": "t1", "nome": "Turma 1", "turno_id": "manha"}],
        "disciplinas": [
            {"id": "mat", "nome": "Matemática"},
            {"id": "por", "nome": "Português"},
        ],
        "professores": [
            {"id": "p1", "nome": "Ana", "disponibilidade": {"s0": "indisponivel"}},
            {"id": "p2", "nome": "Bia"},
        ],
        "atribuicoes": [
            {
                "id": "a-mat",
                "professor_id": "p1",
                "disciplina_id": "mat",
                "turma_id": "t1",
                "carga_semanal": 1,
            },
            {
                "id": "a-por",
                "professor_id": "p2",
                "disciplina_id": "por",
                "turma_id": "t1",
                "carga_semanal": 1,
            },
        ],
        "regras": [{"id": "r-disp", "tipo": "disponibilidade_professor", "hard": True}],
    }


def _corpo(grade: list[tuple[str, str]], instancia: dict | None = None) -> bytes:
    return json.dumps(
        {
            "instancia": instancia or _instancia(),
            "grade": [{"atribuicao_id": a, "slot_id": s} for a, s in grade],
        }
    ).encode()


VALIDA = [("a-mat", "s1"), ("a-por", "s0")]
VIOLADA = [("a-mat", "s0"), ("a-por", "s1")]  # Ana está indisponível em s0


@pytest.fixture()
def servico() -> validador.Validador:
    return validador.Validador(token=TOKEN, capacidade_cache=2)


def test_sem_token_ou_token_errado_e_401(servico):
    assert servico.tratar(_corpo(VALIDA), None)[0] == 401
    assert servico.tratar(_corpo(VALIDA), "Bearer outro")[0] == 401
    assert servico.tratar(_corpo(VALIDA), TOKEN)[0] == 401  # falta o "Bearer "


def test_json_invalido_e_400(servico):
    status, resposta = servico.tratar(b"{nao-e-json", f"Bearer {TOKEN}")
    assert status == 400
    assert "erro" in resposta


def test_contrato_invalido_e_422(servico):
    corpo = json.dumps({"instancia": {"turnos": []}, "grade": []}).encode()
    status, resposta = servico.tratar(corpo, f"Bearer {TOKEN}")
    assert status == 422
    assert "erro" in resposta


def test_grade_valida_e_violada(servico):
    status, resposta = servico.tratar(_corpo(VALIDA), f"Bearer {TOKEN}")
    assert status == 200
    assert resposta["violacoes_hard"] == []

    status, resposta = servico.tratar(_corpo(VIOLADA), f"Bearer {TOKEN}")
    assert status == 200
    assert resposta["violacoes_hard"] == ["disponibilidade:p1"]


def test_mesma_instancia_prepara_uma_vez(servico, monkeypatch):
    preparos = []
    original = validador.AvaliadorPreparado

    def contar(instancia):
        preparos.append(instancia)
        return original(instancia)

    monkeypatch.setattr(validador, "AvaliadorPreparado", contar)
    for grade in [VALIDA, VIOLADA, VALIDA]:
        assert servico.tratar(_corpo(grade), f"Bearer {TOKEN}")[0] == 200
    assert len(preparos) == 1


def test_cache_descarta_a_instancia_menos_usada(servico, monkeypatch):
    preparos = []
    original = validador.AvaliadorPreparado

    def contar(instancia):
        preparos.append(instancia)
        return original(instancia)

    monkeypatch.setattr(validador, "AvaliadorPreparado", contar)

    def variante(nome: str) -> dict:
        inst = _instancia()
        inst["turmas"][0]["nome"] = nome  # muda o hash, não o modelo
        return inst

    for nome in ["A", "B", "A", "C", "A", "B"]:
        corpo = _corpo(VALIDA, variante(nome))
        assert servico.tratar(corpo, f"Bearer {TOKEN}")[0] == 200
    # capacidade 2: A, B, (A em cache), C expulsa B, (A em cache), B de novo
    assert [p.turmas[0].nome for p in preparos] == ["A", "B", "C", "B"]


def test_http_avaliar_e_saude(servico):
    servidor = validador.criar_servidor(servico, porta=0)
    porta = servidor.server_address[1]
    thread = threading.Thread(target=servidor.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{porta}"
        with urllib.request.urlopen(f"{base}/saude", timeout=5) as r:
            assert r.status == 200

        pedido = urllib.request.Request(
            f"{base}/avaliar",
            data=_corpo(VIOLADA),
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(pedido, timeout=10) as r:
            assert r.status == 200
            assert json.loads(r.read())["violacoes_hard"] == ["disponibilidade:p1"]

        sem_token = urllib.request.Request(
            f"{base}/avaliar", data=_corpo(VALIDA), method="POST"
        )
        with pytest.raises(urllib.error.HTTPError) as erro:
            urllib.request.urlopen(sem_token, timeout=5)
        assert erro.value.code == 401

        with pytest.raises(urllib.error.HTTPError) as erro:
            urllib.request.urlopen(f"{base}/outra", timeout=5)
        assert erro.value.code == 404
    finally:
        servidor.shutdown()
        servidor.server_close()


def test_configuracao_exige_token(monkeypatch):
    monkeypatch.delenv("VALIDADOR_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="VALIDADOR_TOKEN"):
        validador.carregar_configuracao()
    monkeypatch.setenv("VALIDADOR_TOKEN", "x")
    monkeypatch.setenv("PORT", "9090")
    assert validador.carregar_configuracao() == ("x", 9090)
