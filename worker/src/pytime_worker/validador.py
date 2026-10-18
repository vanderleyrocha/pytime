"""Validador da edição manual: `POST /avaliar` sobre o `AvaliadorPreparado`.

Processo separado do loop da fila (mesmo app no Fly, `[processes]
validador`). Só o servidor Next.js chama, autenticado por
`Authorization: Bearer <VALIDADOR_TOKEN>`; o navegador nunca fala com ele.
Montar o modelo é a parte cara, então um `AvaliadorPreparado` fica em cache
por instância (chave: hash do JSON validado) e cada edição só avalia a grade.
"""

import hashlib
import hmac
import json
import os
import threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from pydantic import BaseModel, ValidationError
from pytime_engine import AvaliadorPreparado, Instancia
from pytime_engine.resultado import AulaAlocada

#: corpo máximo aceito (instância de 80 turmas ≈ 1-2 MB de JSON)
LIMITE_CORPO = 20 * 1024 * 1024


class PedidoAvaliacao(BaseModel):
    instancia: Instancia
    grade: list[AulaAlocada]


class _Entrada:
    """Avaliador de uma instância + trava que serializa o uso dele."""

    def __init__(self) -> None:
        self.trava = threading.Lock()
        self.preparado: AvaliadorPreparado | None = None


class Validador:
    """Regras do endpoint, sem HTTP: autentica, valida, avalia com cache."""

    def __init__(self, token: str, capacidade_cache: int = 4):
        self._token = token
        self._capacidade = capacidade_cache
        self._cache: OrderedDict[str, _Entrada] = OrderedDict()
        self._trava_cache = threading.Lock()

    def tratar(
        self, corpo: bytes, autorizacao: str | None
    ) -> tuple[int, dict[str, Any]]:
        """Devolve (status HTTP, corpo JSON) para um `POST /avaliar`."""
        esperado = f"Bearer {self._token}"
        if autorizacao is None or not hmac.compare_digest(
            autorizacao.encode(), esperado.encode()
        ):
            return 401, {"erro": "Não autorizado."}
        try:
            dados = json.loads(corpo)
        except (ValueError, UnicodeDecodeError):
            return 400, {"erro": "Corpo não é JSON válido."}
        try:
            pedido = PedidoAvaliacao.model_validate(dados)
        except ValidationError as excecao:
            return 422, {"erro": f"Pedido inválido: {excecao}"}

        entrada = self._entrada(pedido.instancia)
        try:
            # o mesmo modelo não é clonado por duas threads ao mesmo tempo
            with entrada.trava:
                if entrada.preparado is None:
                    entrada.preparado = AvaliadorPreparado(pedido.instancia)
                avaliacao = entrada.preparado.avaliar(pedido.grade)
        except Exception as excecao:  # noqa: BLE001 - vira 500 legível
            return 500, {"erro": f"Falha na avaliação: {excecao}"}
        return 200, avaliacao.model_dump()

    def _entrada(self, instancia: Instancia) -> _Entrada:
        chave = hashlib.sha256(instancia.model_dump_json().encode()).hexdigest()
        with self._trava_cache:
            entrada = self._cache.get(chave)
            if entrada is None:
                entrada = _Entrada()
                self._cache[chave] = entrada
                while len(self._cache) > self._capacidade:
                    self._cache.popitem(last=False)
            else:
                self._cache.move_to_end(chave)
            return entrada


def criar_servidor(validador: Validador, porta: int) -> ThreadingHTTPServer:
    """Servidor HTTP com `POST /avaliar` e `GET /saude` (health check do Fly)."""

    class Manipulador(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - nome exigido pelo http.server
            if self.path == "/saude":
                self._responder(200, {"ok": True})
            else:
                self._responder(404, {"erro": "Rota inexistente."})

        def do_POST(self) -> None:  # noqa: N802 - nome exigido pelo http.server
            if self.path != "/avaliar":
                self._responder(404, {"erro": "Rota inexistente."})
                return
            try:
                tamanho = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                tamanho = -1
            if tamanho < 0:
                self._responder(400, {"erro": "Content-Length inválido."})
                return
            if tamanho > LIMITE_CORPO:
                self._responder(413, {"erro": "Corpo grande demais."})
                return
            corpo = self.rfile.read(tamanho)
            status, resposta = validador.tratar(
                corpo, self.headers.get("Authorization")
            )
            self._responder(status, resposta)

        def _responder(self, status: int, resposta: dict[str, Any]) -> None:
            dados = json.dumps(resposta, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def log_message(self, formato: str, *args: Any) -> None:
            print(f"validador: {formato % args}", flush=True)

    return ThreadingHTTPServer(("0.0.0.0", porta), Manipulador)


def carregar_configuracao() -> tuple[str, int]:
    """(token, porta) das variáveis `VALIDADOR_TOKEN` e `PORT` (padrão 8080)."""
    token = os.environ.get("VALIDADOR_TOKEN")
    if not token:
        raise RuntimeError("Defina VALIDADOR_TOKEN para o validador.")
    return token, int(os.environ.get("PORT", "8080"))


def rodar() -> None:
    token, porta = carregar_configuracao()
    servidor = criar_servidor(Validador(token), porta)
    print(f"Validador PyTime ouvindo na porta {porta}.", flush=True)
    servidor.serve_forever()


if __name__ == "__main__":
    rodar()
