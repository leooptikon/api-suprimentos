import os
from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

FUSO = ZoneInfo(os.getenv("TZ_ESCRITORIO", "America/Sao_Paulo"))

_CABECALHO = PatternFill("solid", fgColor="0E7490")


def planilha(titulo: str, colunas: list[str], linhas: list[list], rodape: list | None = None) -> BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = titulo
    _preencher(ws, colunas, linhas, rodape)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def pasta_de_trabalho(abas: list[tuple[str, list[str], list[list]]]) -> bytes:
    """Um arquivo .xlsx com várias abas: [(titulo, colunas, linhas), …]."""
    wb = Workbook()
    wb.remove(wb.active)
    for titulo, colunas, linhas in abas:
        _preencher(wb.create_sheet(titulo[:31]), colunas, linhas)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _preencher(ws, colunas: list[str], linhas: list[list], rodape: list | None = None):
    ws.append(colunas)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = _CABECALHO
        c.alignment = Alignment(vertical="center")
    for linha in linhas:
        ws.append(linha)
    for i, col in enumerate(colunas, start=1):
        largura = max([len(str(col))] + [len(str(l[i - 1] or "")) for l in linhas])
        ws.column_dimensions[get_column_letter(i)].width = min(max(largura + 2, 10), 60)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    if rodape:
        ws.append([])
        ws.append(rodape)
        for c in ws[ws.max_row]:
            c.font = Font(bold=True)


def download(buf: BytesIO, nome: str) -> StreamingResponse:
    carimbo = datetime.now(FUSO).strftime("%Y-%m-%d")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}-{carimbo}.xlsx"'},
    )
