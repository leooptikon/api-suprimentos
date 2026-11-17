"""Ativador para o Render grátis, que desliga o serviço depois de 15 min sem acesso.

Com o serviço desligado, param também as tarefas automáticas (preços do Mercado Livre e planilha
do OneDrive). Então o próprio site chama o seu endereço PÚBLICO a cada MANTER_ACORDADO_SEGUNDOS:
a chamada passa pela entrada do Render e conta como acesso.

O Render informa o endereço sozinho em RENDER_EXTERNAL_URL. Fora do Render (servidor do escritório,
desenvolvimento) essa variável não existe e nada é feito. MANTER_ACORDADO_URL força outro endereço.
"""

import logging
import os
import threading
import time
import urllib.request

log = logging.getLogger(__name__)

URL = (os.getenv("MANTER_ACORDADO_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
INTERVALO = int(os.getenv("MANTER_ACORDADO_SEGUNDOS", "120"))


def iniciar():
    if not URL:
        return

    def laco():
        alvo = f"{URL}/api/saude"
        falhas = 0
        while True:
            time.sleep(INTERVALO)
            try:
                with urllib.request.urlopen(urllib.request.Request(alvo, headers={"User-Agent": "trace-ativador"}), timeout=30):
                    pass
                falhas = 0
            except Exception as e:  # nunca pode derrubar o site; só avisa (de vez em quando) no log
                falhas += 1
                if falhas in (1, 10) or falhas % 60 == 0:
                    log.warning("Ativador: não consegui chamar %s (%s)", alvo, e)

    threading.Thread(target=laco, name="manter-acordado", daemon=True).start()
    log.info("Ativador ligado: chama %s a cada %ss", URL, INTERVALO)
