from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Iterable, Sequence

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
LOGO = ROOT / "assets" / "images" / "logo.png"
PAGE_W, PAGE_H = landscape(A4)

FONT_REGULAR = "GT-Regular"
FONT_BOLD = "GT-Bold"
FONT_ITALIC = "GT-Italic"

INK = HexColor("#17191C")
MUTED = HexColor("#68717C")
SUBTLE = HexColor("#8D96A0")
LINE = HexColor("#DCE2E7")
SURFACE = HexColor("#F4F6F8")
PAPER = HexColor("#FCFCFB")
ORANGE = HexColor("#FF9000")
ORANGE_DARK = HexColor("#B85D00")
ORANGE_SOFT = HexColor("#FFF3E3")
GREEN = HexColor("#168A57")
GREEN_SOFT = HexColor("#EAF8F1")
AMBER = HexColor("#B76A00")
AMBER_SOFT = HexColor("#FFF5DE")
RED = HexColor("#C93F4B")
RED_DARK = HexColor("#8F2530")
RED_SOFT = HexColor("#FCECEF")
BLUE = HexColor("#2877A5")
BLUE_SOFT = HexColor("#EAF5FB")


def register_fonts() -> None:
    fonts = {
        FONT_REGULAR: Path(r"C:\Windows\Fonts\arial.ttf"),
        FONT_BOLD: Path(r"C:\Windows\Fonts\arialbd.ttf"),
        FONT_ITALIC: Path(r"C:\Windows\Fonts\ariali.ttf"),
    }
    for name, path in fonts.items():
        if not path.exists():
            raise FileNotFoundError(f"Font lipsă: {path}")
        pdfmetrics.registerFont(TTFont(name, str(path)))


def rounded(c: canvas.Canvas, x: float, y: float, w: float, h: float, radius: float = 10,
            fill: Color = white, stroke: Color | None = LINE, width: float = 0.7) -> None:
    c.saveState()
    c.setFillColor(fill)
    if stroke is None:
        c.setStrokeColor(fill)
    else:
        c.setStrokeColor(stroke)
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)
    c.restoreState()


def pill(c: canvas.Canvas, x: float, y: float, text: str, fill: Color, color: Color,
         pad_x: float = 10, height: float = 20, border: Color | None = None) -> float:
    c.setFont(FONT_BOLD, 7.2)
    width = pdfmetrics.stringWidth(text, FONT_BOLD, 7.2) + pad_x * 2
    rounded(c, x, y, width, height, height / 2, fill, border or fill, 0.7)
    c.setFillColor(color)
    c.drawCentredString(x + width / 2, y + 6.4, text)
    return width


def wrap(text: str, font: str, size: float, width: float, max_lines: int | None = None) -> list[str]:
    words = str(text or "-").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or pdfmetrics.stringWidth(candidate, font, size) <= width:
            current = candidate
            continue
        lines.append(current)
        current = word
        if max_lines and len(lines) >= max_lines:
            break
    if current and (not max_lines or len(lines) < max_lines):
        lines.append(current)
    if max_lines and len(lines) == max_lines and len(" ".join(lines)) < len(" ".join(words)):
        line = lines[-1]
        while line and pdfmetrics.stringWidth(line + "...", font, size) > width:
            line = line[:-1]
        lines[-1] = line.rstrip() + "..."
    return lines or ["-"]


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: float, font: str = FONT_REGULAR,
                 size: float = 8, color: Color = INK, leading: float | None = None,
                 max_lines: int | None = None) -> float:
    leading = leading or size * 1.28
    c.setFont(font, size)
    c.setFillColor(color)
    lines = wrap(text, font, size, width, max_lines)
    for index, line in enumerate(lines):
        c.drawString(x, y - index * leading, line)
    return y - len(lines) * leading


def small_caps(c: canvas.Canvas, text: str, x: float, y: float, color: Color = MUTED, size: float = 6.3) -> None:
    c.setFillColor(color)
    c.setFont(FONT_BOLD, size)
    c.drawString(x, y, text.upper())


def value(c: canvas.Canvas, text: str, x: float, y: float, color: Color = INK, size: float = 9,
          max_width: float | None = None) -> None:
    c.setFillColor(color)
    c.setFont(FONT_BOLD, size)
    if max_width:
        while size > 6.2 and pdfmetrics.stringWidth(str(text), FONT_BOLD, size) > max_width:
            size -= 0.25
            c.setFont(FONT_BOLD, size)
    c.drawString(x, y, str(text))


def label_value(c: canvas.Canvas, label: str, text: str, x: float, y: float, width: float,
                value_color: Color = INK) -> None:
    small_caps(c, label, x, y)
    draw_wrapped(c, text, x, y - 12, width, FONT_BOLD, 8.2, value_color, 9.6, 2)


def draw_logo(c: canvas.Canvas, x: float, y: float, size: float = 38) -> None:
    rounded(c, x, y, size, size, 11, ORANGE, ORANGE, 0)
    c.drawImage(str(LOGO), x, y, width=size, height=size, preserveAspectRatio=True, mask="auto")


def document_header(c: canvas.Canvas, title: str, subtitle: str, number: str, status: str,
                    status_fill: Color, status_soft: Color, page_label: str,
                    watermark: str | None = None) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(status_fill)
    c.rect(0, PAGE_H - 6, PAGE_W, 6, fill=1, stroke=0)
    if watermark:
        c.saveState()
        c.setFillColor(Color(status_fill.red, status_fill.green, status_fill.blue, alpha=0.045))
        c.setFont(FONT_BOLD, 66)
        c.translate(PAGE_W / 2, PAGE_H / 2)
        c.rotate(24)
        c.drawCentredString(0, -22, watermark)
        c.restoreState()

    draw_logo(c, 28, PAGE_H - 62, 38)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 12)
    c.drawString(76, PAGE_H - 35, "G-TROTS ROMÂNIA")
    c.setFont(FONT_REGULAR, 6.7)
    c.setFillColor(MUTED)
    c.drawString(76, PAGE_H - 47, "Denumire comercială operată de CAB IT EXPERT SRL")
    c.drawString(76, PAGE_H - 57, "CUI 49972605  |  Reg. Com. J2024008303400  |  contact@g-trots.ro")

    center_x = 404
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 14.5)
    c.drawCentredString(center_x, PAGE_H - 34, title)
    c.setFont(FONT_BOLD, 7.3)
    c.setFillColor(status_fill)
    c.drawCentredString(center_x, PAGE_H - 48, subtitle)
    c.setFont(FONT_REGULAR, 6.4)
    c.setFillColor(SUBTLE)
    c.drawCentredString(center_x, PAGE_H - 58, "Document financiar-contabil generat electronic")

    right_x = PAGE_W - 190
    right_edge = PAGE_W - 28
    small_caps(c, "Document", right_x, PAGE_H - 28)
    value(c, number, right_x, PAGE_H - 43, INK, 10.5, right_edge - right_x)
    c.setFillColor(SUBTLE)
    c.setFont(FONT_BOLD, 5.5)
    c.drawString(right_x, PAGE_H - 65, page_label)
    status_width = pdfmetrics.stringWidth(status, FONT_BOLD, 7.2) + 18
    pill(c, right_edge - status_width, PAGE_H - 71, status, status_soft, status_fill, 9, 18, status_fill)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(28, PAGE_H - 74, PAGE_W - 28, PAGE_H - 74)


def footer(c: canvas.Canvas, document_number: str, page: int, total: int, status: str,
           document_id: str, status_color: Color, generated_at: str) -> None:
    y = 23
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(28, y + 15, PAGE_W - 28, y + 15)
    c.setFillColor(MUTED)
    c.setFont(FONT_BOLD, 6.2)
    c.drawString(28, y + 3, f"{document_number}  |  ID {document_id[:18]}")
    c.setFont(FONT_REGULAR, 5.9)
    c.drawCentredString(PAGE_W / 2, y + 3, f"Generat la {generated_at}  |  G-Trots Management 2.4.1  |  Versiune document 1")
    c.setFillColor(status_color)
    c.setFont(FONT_BOLD, 6.2)
    c.drawRightString(PAGE_W - 28, y + 3, f"{status}  |  Pagina {page} din {total}")
    c.setFillColor(SUBTLE)
    c.setFont(FONT_REGULAR, 5.2)
    c.drawCentredString(PAGE_W / 2, 10, "Documentul se arhivează împreună cu factura, avizul și documentele justificative aferente.")


def info_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, eyebrow: str,
              title: str, fields: Sequence[tuple[str, str]], accent: Color = ORANGE) -> None:
    rounded(c, x, y, w, h, 11, white, LINE)
    c.setFillColor(accent)
    c.roundRect(x, y, 4, h, 2, fill=1, stroke=0)
    small_caps(c, eyebrow, x + 14, y + h - 16, accent)
    draw_wrapped(c, title, x + 14, y + h - 31, w - 28, FONT_BOLD, 10, INK, 11.5, 2)
    field_y = y + h - 54
    col_width = (w - 28) / 2
    for index, (label, text) in enumerate(fields[:4]):
        col = index % 2
        row = index // 2
        label_value(c, label, text, x + 14 + col * col_width, field_y - row * 31, col_width - 10)


def metric(c: canvas.Canvas, x: float, y: float, w: float, label: str, number: str,
           caption: str, color: Color, soft: Color) -> None:
    rounded(c, x, y, w, 51, 10, soft, Color(color.red, color.green, color.blue, alpha=0.18))
    small_caps(c, label, x + 12, y + 34, color)
    c.setFillColor(color)
    c.setFont(FONT_BOLD, 15)
    c.drawString(x + 12, y + 16, number)
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.1)
    c.drawRightString(x + w - 10, y + 17, caption)


def draw_table(c: canvas.Canvas, x: float, y_top: float, widths: Sequence[float], headers: Sequence[str],
               rows: Sequence[Sequence[str]], row_height: float, accent: Color,
               negative_columns: Iterable[int] = ()) -> float:
    total_w = sum(widths)
    header_h = 26
    c.setFillColor(INK)
    c.roundRect(x, y_top - header_h, total_w, header_h, 8, fill=1, stroke=0)
    cursor = x
    for index, (width, header) in enumerate(zip(widths, headers)):
        c.setFillColor(white)
        c.setFont(FONT_BOLD, 5.9)
        c.drawString(cursor + 7, y_top - 16, header.upper())
        cursor += width

    y = y_top - header_h
    negative_columns = set(negative_columns)
    for row_index, row in enumerate(rows):
        y -= row_height
        fill = white if row_index % 2 == 0 else HexColor("#F8F9FA")
        c.setFillColor(fill)
        c.setStrokeColor(LINE)
        c.rect(x, y, total_w, row_height, fill=1, stroke=1)
        c.setFillColor(accent)
        c.rect(x, y, 3, row_height, fill=1, stroke=0)
        cursor = x
        for col_index, (width, text) in enumerate(zip(widths, row)):
            if col_index:
                c.setStrokeColor(HexColor("#E8ECEF"))
                c.line(cursor, y + 5, cursor, y + row_height - 5)
            color = RED if col_index in negative_columns else INK
            font = FONT_BOLD if col_index in negative_columns or col_index in {0, 1} else FONT_REGULAR
            draw_wrapped(c, str(text), cursor + 7, y + row_height - 13, width - 13, font, 6.3, color, 7.5, 3)
            cursor += width
    return y


def signature_card(c: canvas.Canvas, x: float, y: float, w: float, role: str, name: str,
                   timestamp: str, accent: Color) -> None:
    rounded(c, x, y, w, 66, 10, white, LINE)
    c.setFillColor(accent)
    c.circle(x + 17, y + 47, 5, fill=1, stroke=0)
    small_caps(c, role, x + 29, y + 44, accent)
    value(c, name, x + 14, y + 27, INK, 9.2, w - 28)
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.5)
    c.drawString(x + 14, y + 13, timestamp)


def entry_page_one(c: canvas.Canvas) -> None:
    number = "NIR-2026-000154"
    document_header(c, "NOTĂ DE RECEPȚIE ȘI CONSTATARE DE DIFERENȚE", "NIR - Cod 14-3-1A",
                    number, "FINALIZAT", GREEN, GREEN_SOFT, "MODEL DE PREZENTARE")

    margin = 28
    gap = 10
    card_w = (PAGE_W - margin * 2 - gap * 2) / 3
    y = 397
    info_card(c, margin, y, card_w, 104, "01 / Recepția", "Gestiune principală",
              [("Recepție fizică", "29.08.2026, 15:42"), ("Finalizat", "30.08.2026, 09:15"),
               ("Locație", "Depozit București"), ("Gestionar", "Administrator")], GREEN)
    info_card(c, margin + card_w + gap, y, card_w, 104, "02 / Furnizor", "KIDOTOYS SRL",
              [("CUI / CIF", "RO42489094"), ("Țară", "România"),
               ("Adresă", "București, România"), ("Contact", "Date furnizor validate")], ORANGE)
    info_card(c, margin + (card_w + gap) * 2, y, card_w, 104, "03 / Document sursă", "Factura KID 190",
              [("Data facturii", "29.08.2026"), ("Fișier", "factura-kid-190.pdf"),
               ("Monedă", "RON"), ("Curs", "1,00000000 RON")], BLUE)

    c.setFillColor(AMBER_SOFT)
    c.roundRect(margin, 370, PAGE_W - margin * 2, 18, 7, fill=1, stroke=0)
    c.setFillColor(AMBER)
    c.setFont(FONT_BOLD, 7)
    c.drawString(margin + 10, 376, "REZULTAT RECEPȚIE: MARFĂ VERIFICATĂ ȘI ACCEPTATĂ")
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.4)
    c.drawRightString(PAGE_W - margin - 10, 376, "4 poziții  |  8 buc. facturate  |  8 buc. recepționate  |  8 buc. acceptate")

    metric_w = (PAGE_W - margin * 2 - 30) / 4
    metric(c, margin, 309, metric_w, "Poziții", "4", "toate asociate", GREEN, GREEN_SOFT)
    metric(c, margin + metric_w + 10, 309, metric_w, "Cantitate primită", "8 buc.", "verificată fizic", BLUE, BLUE_SOFT)
    metric(c, margin + (metric_w + 10) * 2, 309, metric_w, "Acceptat în gestiune", "8 buc.", "intrare efectivă", GREEN, GREEN_SOFT)
    metric(c, margin + (metric_w + 10) * 3, 309, metric_w, "Valoare intrare", "987,00 lei", "cost istoric", ORANGE_DARK, ORANGE_SOFT)

    headers = ["Nr.", "Produs furnizor / Produs G-Trots", "U.M.", "Doc.", "Primit", "Acceptat", "Preț net", "Cost unitar", "Valoare intrare", "TVA"]
    widths = [28, 299, 45, 46, 46, 54, 68, 72, 79, 47]
    rows = [
        ["01", "Cauciuc offroad tubeless 10x2.75-6.5 | Cod furnizor SE-CMM087 | SKU G-Trots SE-CMM087", "buc.", "1", "1", "1", "30,00 RON", "30,00 lei", "30,00 lei", "19%"],
        ["02", "Plăcuțe frână model X | Cod furnizor BF-4587 | SKU G-Trots GT-FR-00218", "set / buc.", "4", "4", "4", "42,50 RON", "43,25 lei", "173,00 lei", "19%"],
        ["03", "Controller KuKirin G4, 48 V, 25 A | Cod furnizor CTR-G4-48 | SKU G-Trots GT-CTR-G4", "buc.", "2", "2", "2", "295,00 RON", "298,00 lei", "596,00 lei", "19%"],
        ["04", "Display LCD KuKirin G2 | Cod furnizor DISP-G2-V3 | SKU G-Trots GT-DSP-G2-V3", "buc.", "1", "1", "1", "185,00 RON", "188,00 lei", "188,00 lei", "19%"],
    ]
    table_bottom = draw_table(c, margin, 296, widths, headers, rows, 34, ORANGE)

    totals_y = table_bottom - 64
    rounded(c, margin, totals_y, 470, 53, 11, SURFACE, LINE)
    small_caps(c, "Centralizare document", margin + 14, totals_y + 36, ORANGE_DARK)
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.6)
    c.drawString(margin + 14, totals_y + 21, "Valoare netă factură 975,00 lei   |   TVA 185,25 lei   |   Total furnizor 1.160,25 lei")
    c.drawString(margin + 14, totals_y + 10, "Costuri directe alocate 12,00 lei   |   Metodă: repartizare manuală verificată")
    rounded(c, margin + 480, totals_y, PAGE_W - margin * 2 - 480, 53, 11, ORANGE_SOFT, ORANGE)
    small_caps(c, "Valoare totală de intrare", margin + 494, totals_y + 36, ORANGE_DARK)
    c.setFillColor(ORANGE_DARK)
    c.setFont(FONT_BOLD, 17)
    c.drawString(margin + 494, totals_y + 14, "987,00 lei")

    footer(c, number, 1, 2, "FINALIZAT", "996c4f10-ec2e-4630-9de7-131a7b4ce803", GREEN, "30.08.2026, 13:40")
    c.showPage()


def entry_page_two(c: canvas.Canvas) -> None:
    number = "NIR-2026-000154"
    document_header(c, "VERIFICĂRI ȘI VALIDARE", "Anexă la NIR - Cod 14-3-1A",
                    number, "FINALIZAT", GREEN, GREEN_SOFT, "MODEL DE PREZENTARE")

    rounded(c, 28, 437, PAGE_W - 56, 62, 12, AMBER_SOFT, HexColor("#E8C88E"))
    pill(c, 42, 466, "RECEPȚIE VALIDATĂ", GREEN, white, 10, 20, GREEN)
    draw_wrapped(c, "Toate pozițiile au fost verificate cantitativ și calitativ, asociate produselor interne și acceptate în gestiune conform documentului furnizorului.",
                 42, 453, 730, FONT_BOLD, 8.4, INK, 10.5, 2)

    rounded(c, 28, 345, 355, 80, 11, white, LINE)
    small_caps(c, "Verificări efectuate", 42, 407, GREEN)
    checks = ["Număr colete", "Integritate ambalaje", "Cantități", "Coduri produse", "Stare fizică", "Concordanță factură"]
    for index, check in enumerate(checks):
        col = index % 3
        row = index // 3
        x = 42 + col * 109
        y = 383 - row * 25
        c.setFillColor(GREEN_SOFT)
        c.circle(x + 5, y + 3, 6, fill=1, stroke=0)
        c.setStrokeColor(GREEN)
        c.setLineWidth(1.2)
        c.line(x + 1.5, y + 2.7, x + 4.1, y)
        c.line(x + 4.1, y, x + 8.8, y + 6.1)
        c.setFillColor(INK)
        c.setFont(FONT_BOLD, 6.7)
        c.drawString(x + 16, y, check)

    rounded(c, 393, 345, PAGE_W - 421, 80, 11, GREEN_SOFT, HexColor("#B9E1D0"))
    small_caps(c, "Concluzia recepției", 407, 407, GREEN)
    value(c, "Controller KuKirin G4, 48 V, 25 A", 407, 389, INK, 9.2, 380)
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.7)
    c.drawString(407, 373, "Cantitate: 2 buc.  |  Stare: conformă  |  Locație: Gestiune principală")
    c.drawString(407, 360, "Măsură: intrare în stoc la costul contabil calculat")

    small_caps(c, "Centralizarea verificării", 28, 328, GREEN)
    headers = ["Poz.", "Produs / SKU", "Verificare", "Document", "Primit", "Acceptat", "Valoare", "Măsură luată"]
    widths = [39, 235, 110, 65, 65, 65, 80, 125]
    rows = [["03", "Controller KuKirin G4 | GT-CTR-G4", "Cantitativ și calitativ", "2 buc.", "2 buc.", "2 buc.", "596,00 lei", "Intrare în gestiune"]]
    draw_table(c, 28, 315, widths, headers, rows, 42, AMBER)

    rounded(c, 28, 196, 385, 60, 11, SURFACE, LINE)
    small_caps(c, "Documente asociate", 42, 238, BLUE)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 7.2)
    c.drawString(42, 221, "01  Factura KID 190  |  factura-kid-190.pdf")
    c.drawString(42, 207, "02  Fotografie poziția 03  |  controller-g4-conector.jpg")
    rounded(c, 423, 196, PAGE_W - 451, 60, 11, BLUE_SOFT, HexColor("#BFD9E8"))
    small_caps(c, "Cum se citește documentul", 437, 238, BLUE)
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.3)
    c.drawString(437, 222, "DOC. = cantitatea furnizorului   |   PRIMIT = verificat fizic")
    c.drawString(437, 209, "ACCEPTAT = cantitatea care intră efectiv în gestiune")

    small_caps(c, "Persoane responsabile și audit", 28, 178, GREEN)
    sig_w = (PAGE_W - 56 - 20) / 3
    signature_card(c, 28, 101, sig_w, "Recepționat cantitativ", "Administrator", "29.08.2026, 15:42", GREEN)
    signature_card(c, 28 + sig_w + 10, 101, sig_w, "Verificat documentar", "Administrator", "30.08.2026, 09:10", BLUE)
    signature_card(c, 28 + (sig_w + 10) * 2, 101, sig_w, "Validat pentru gestiune", "Administrator", "30.08.2026, 09:15", ORANGE_DARK)

    rounded(c, 28, 54, PAGE_W - 56, 36, 9, SURFACE, LINE)
    small_caps(c, "Jurnal de audit", 42, 76, MUTED)
    c.setFillColor(INK)
    c.setFont(FONT_REGULAR, 6.2)
    hash_value = hashlib.sha256(number.encode("utf-8")).hexdigest().upper()
    c.drawString(42, 62, f"Versiune 1  |  Hash model {hash_value[:24]}  |  Sursă: aplicația G-Trots  |  Fișiere asociate: 2")

    footer(c, number, 2, 2, "FINALIZAT", "996c4f10-ec2e-4630-9de7-131a7b4ce803", GREEN, "30.08.2026, 13:40")
    c.showPage()


def reversal_page_one(c: canvas.Canvas) -> None:
    number = "NIR-2026-000155"
    document_header(c, "DOCUMENT DE STORNARE A NOTEI DE RECEPȚIE", "NIR - Cod 14-3-1A",
                    number, "STORNAT", RED, RED_SOFT, "MODEL DE PREZENTARE", "STORNARE")

    rounded(c, 28, 431, PAGE_W - 56, 68, 12, RED_SOFT, HexColor("#E8BFC4"))
    pill(c, 42, 465, "LEGĂTURĂ OBLIGATORIE", RED, white, 10, 20, RED)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 11)
    c.drawString(42, 446, "Stornarea integrală a NIR-2026-000154 din 29.08.2026")
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.7)
    c.drawRightString(PAGE_W - 42, 470, "Document original păstrat nemodificat în arhivă")
    c.drawString(42, 434, "Factura storno KID 191 din 30.08.2026  |  Referință: factura KID 190 din 29.08.2026  |  Motiv: retur furnizor")

    margin = 28
    gap = 10
    card_w = (PAGE_W - margin * 2 - gap * 2) / 3
    info_card(c, margin, 318, card_w, 101, "01 / Document original", "NIR-2026-000154",
              [("Status original", "CONFIRMAT"), ("Data recepției", "29.08.2026, 15:42"),
               ("Valoare intrare", "987,00 lei"), ("Versiune", "1")], RED)
    info_card(c, margin + card_w + gap, 318, card_w, 101, "02 / Furnizor și factură", "KIDOTOYS SRL",
              [("CUI / CIF", "RO42489094"), ("Factura storno", "KID 191"),
               ("Data facturii", "30.08.2026"), ("Referință", "KID 190 · 29.08.2026")], ORANGE)
    info_card(c, margin + (card_w + gap) * 2, 318, card_w, 101, "03 / Stornare", "NIR-2026-000155",
               [("Data", "30.08.2026, 14:18"), ("Tip", "Integrală"),
                ("Aprobat de", "Administrator"), ("Status", "STORNAT")], RED)

    metric(c, margin, 254, 145, "Poziții stornate", "4", "din NIR original", RED, RED_SOFT)
    metric(c, margin + 153, 254, 145, "Cantitate stornată", "-8 buc.", "efect integral", RED, RED_SOFT)
    metric(c, margin + 306, 254, 145, "Costuri anulate", "-12,00 lei", "direct atribuibile", AMBER, AMBER_SOFT)
    metric(c, margin + 459, 254, 145, "TVA aferent", "-185,25 lei", "conform facturii", RED_DARK, RED_SOFT)
    metric(c, margin + 612, 254, PAGE_W - margin * 2 - 612, "Efect valoric", "-987,00 lei", "neutralizare", RED, RED_SOFT)

    headers = ["Poz. originală", "Produs furnizor / Produs G-Trots", "U.M.", "Acceptat inițial", "Stornat", "Cost unitar", "Valoare stornată", "TVA", "Motiv / observații"]
    widths = [55, 265, 48, 74, 65, 75, 89, 48, 68]
    rows = [
        ["01", "Cauciuc offroad tubeless 10x2.75-6.5 | SE-CMM087", "buc.", "1", "-1", "30,00 lei", "-30,00 lei", "19%", "Retur"],
        ["02", "Plăcuțe frână model X | GT-FR-00218", "set / buc.", "4", "-4", "43,25 lei", "-173,00 lei", "19%", "Retur"],
        ["03", "Controller KuKirin G4 | GT-CTR-G4", "buc.", "2", "-2", "298,00 lei", "-596,00 lei", "19%", "Retur"],
        ["04", "Display LCD KuKirin G2 | GT-DSP-G2-V3", "buc.", "1", "-1", "188,00 lei", "-188,00 lei", "19%", "Retur"],
    ]
    draw_table(c, margin, 241, widths, headers, rows, 28, RED, {4, 6})

    totals_y = 46
    rounded(c, margin, totals_y, 470, 53, 11, SURFACE, LINE)
    small_caps(c, "Document original", margin + 14, totals_y + 36, MUTED)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 7.1)
    c.drawString(margin + 14, totals_y + 20, "NIR-2026-000154  |  Valoare intrare 987,00 lei  |  Status: CONFIRMAT")
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.1)
    c.drawString(margin + 14, totals_y + 9, "Acest document nu șterge și nu suprascrie documentul original.")
    rounded(c, margin + 480, totals_y, PAGE_W - margin * 2 - 480, 53, 11, RED_SOFT, RED)
    small_caps(c, "Efectul total al stornării", margin + 494, totals_y + 36, RED)
    c.setFillColor(RED)
    c.setFont(FONT_BOLD, 17)
    c.drawString(margin + 494, totals_y + 14, "-987,00 lei")

    footer(c, number, 1, 2, "FINALIZAT - STORNARE", "3a8a602d-a168-4d1b-a55a-b076bd771245", RED, "30.08.2026, 14:18")
    c.showPage()


def reversal_page_two(c: canvas.Canvas) -> None:
    number = "NIR-2026-000155"
    document_header(c, "JUSTIFICARE, RESPONSABILITĂȚI ȘI AUDIT", "Anexă document stornare - Cod 14-3-1A",
                    number, "STORNAT", RED, RED_SOFT, "MODEL DE PREZENTARE", "STORNARE")

    rounded(c, 28, 425, PAGE_W - 56, 74, 12, RED_SOFT, HexColor("#E7BBC1"))
    small_caps(c, "Motivul stornării", 43, 480, RED)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 11)
    c.drawString(43, 461, "Produsele recepționate au fost returnate integral furnizorului.")
    draw_wrapped(c, "Stornarea neutralizează efectul recepției și păstrează legătura completă dintre documentul inițial și documentul corectiv. NIR-ul original rămâne arhivat, cu numărul și conținutul său istoric.",
                 43, 446, 740, FONT_REGULAR, 7.2, MUTED, 9.1, 2)

    small_caps(c, "Cronologia operațiunii", 28, 405, RED)
    timeline_y = 337
    steps = [
        ("01", "NIR confirmat", "30.08.2026, 09:15", GREEN),
        ("02", "Stornare solicitată", "30.08.2026, 14:12", AMBER),
        ("03", "Verificare efectuată", "30.08.2026, 14:16", BLUE),
        ("04", "Stornare aprobată", "30.08.2026, 14:18", RED),
    ]
    step_w = (PAGE_W - 56 - 30) / 4
    for index, (nr, title, timestamp, color) in enumerate(steps):
        x = 28 + index * (step_w + 10)
        rounded(c, x, timeline_y, step_w, 55, 10, white, LINE)
        c.setFillColor(color)
        c.circle(x + 18, timeline_y + 37, 9, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont(FONT_BOLD, 6.5)
        c.drawCentredString(x + 18, timeline_y + 34.5, nr)
        value(c, title, x + 34, timeline_y + 36, INK, 8.2, step_w - 44)
        c.setFillColor(MUTED)
        c.setFont(FONT_REGULAR, 6.2)
        c.drawString(x + 34, timeline_y + 20, timestamp)
        if index < len(steps) - 1:
            c.setStrokeColor(LINE)
            c.setLineWidth(1.2)
            c.line(x + step_w, timeline_y + 28, x + step_w + 10, timeline_y + 28)

    rounded(c, 28, 244, 383, 98, 11, white, LINE)
    small_caps(c, "Documente justificative", 42, 322, BLUE)
    document_rows = [
        ("01", "NIR-2026-000154", "Document original"),
        ("02", "Factura KID 190 · 29.08.2026", "Factura originală"),
        ("03", "Factura KID 191 · 30.08.2026", "Factura de storno"),
        ("04", "Proces-verbal retur 2026-118", "Document justificativ"),
    ]
    for index, (nr, title, meta) in enumerate(document_rows):
        row_y = 300 - index * 18
        c.setFillColor(SURFACE)
        c.circle(47, row_y + 2, 7, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.setFont(FONT_BOLD, 6.2)
        c.drawCentredString(47, row_y - 0.5, nr)
        c.setFillColor(INK)
        c.setFont(FONT_BOLD, 7)
        c.drawString(61, row_y, title)
        c.setFillColor(MUTED)
        c.setFont(FONT_REGULAR, 6.2)
        c.drawRightString(394, row_y, meta)

    rounded(c, 421, 244, PAGE_W - 449, 98, 11, SURFACE, LINE)
    small_caps(c, "Comparație documente", 435, 322, RED)
    label_value(c, "Document original", "NIR-2026-000154", 435, 302, 165)
    label_value(c, "Status original", "CONFIRMAT", 620, 302, 150, GREEN)
    label_value(c, "Document corectiv", "NIR-2026-000155", 435, 269, 165)
    label_value(c, "Efect valoric", "-987,00 lei", 620, 269, 150, RED)

    small_caps(c, "Persoane responsabile", 28, 226, RED)
    sig_w = (PAGE_W - 56 - 20) / 3
    signature_card(c, 28, 148, sig_w, "Solicitat de", "Administrator", "30.08.2026, 14:12", AMBER)
    signature_card(c, 28 + sig_w + 10, 148, sig_w, "Verificat de", "Administrator", "30.08.2026, 14:16", BLUE)
    signature_card(c, 28 + (sig_w + 10) * 2, 148, sig_w, "Aprobat de", "Administrator", "30.08.2026, 14:18", RED)

    rounded(c, 28, 82, PAGE_W - 56, 53, 11, HexColor("#FFF8F8"), HexColor("#E8C7CB"))
    c.setFillColor(RED)
    c.setFont(FONT_BOLD, 8)
    c.drawString(42, 117, "EFECT ȘI TRASABILITATE")
    draw_wrapped(c, "Acest document nu șterge și nu modifică NIR-ul original. El documentează neutralizarea integrală a efectului recepției, păstrând trasabilitatea ambelor documente și a persoanelor care au aprobat operațiunea.",
                 42, 101, PAGE_W - 84, FONT_BOLD, 7.4, INK, 9.4, 2)

    rounded(c, 28, 48, PAGE_W - 56, 26, 8, SURFACE, LINE)
    hash_value = hashlib.sha256(number.encode("utf-8")).hexdigest().upper()
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.1)
    c.drawString(42, 58, f"Jurnal audit: versiune 1  |  Hash model {hash_value[:28]}  |  Sursă: G-Trots Management  |  Fișiere asociate: 4")

    footer(c, number, 2, 2, "FINALIZAT - STORNARE", "3a8a602d-a168-4d1b-a55a-b076bd771245", RED, "30.08.2026, 14:18")
    c.showPage()


def build_entry(path: Path) -> None:
    pdf = canvas.Canvas(str(path), pagesize=landscape(A4), pageCompression=1)
    pdf.setTitle("Model NIR de intrare G-Trots")
    pdf.setAuthor("G-Trots Management")
    pdf.setSubject("Notă de recepție și constatare de diferențe - Cod 14-3-1A")
    entry_page_one(pdf)
    entry_page_two(pdf)
    pdf.save()


def build_reversal(path: Path) -> None:
    pdf = canvas.Canvas(str(path), pagesize=landscape(A4), pageCompression=1)
    pdf.setTitle("Model NIR de stornare G-Trots")
    pdf.setAuthor("G-Trots Management")
    pdf.setSubject("Document de stornare a notei de recepție")
    reversal_page_one(pdf)
    reversal_page_two(pdf)
    pdf.save()


def main() -> None:
    register_fonts()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    entry = OUTPUT / "model-nir-intrare-g-trots.pdf"
    reversal = OUTPUT / "model-nir-stornare-g-trots.pdf"
    build_entry(entry)
    build_reversal(reversal)
    print(entry)
    print(reversal)


if __name__ == "__main__":
    main()
