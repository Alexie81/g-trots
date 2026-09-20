from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "templates" / "aviz-expeditie-marfa-g-trots-cu-stampila.pdf"
OUTPUT_NO_STAMP = ROOT / "docs" / "templates" / "aviz-expeditie-marfa-g-trots-fara-stampila.pdf"
LOGO = ROOT / "assets" / "images" / "logo.png"
PAGE_W, PAGE_H = A4

FONT = "GT-Arial"
FONT_BOLD = "GT-Arial-Bold"

INK = HexColor("#17191C")
MUTED = HexColor("#66707A")
SUBTLE = HexColor("#8E969E")
LINE = HexColor("#D9DEE3")
LINE_DARK = HexColor("#BFC6CD")
SURFACE = HexColor("#F5F7F8")
ORANGE = HexColor("#FF9000")
ORANGE_DARK = HexColor("#A94F00")
ORANGE_SOFT = HexColor("#FFF3E3")
FIELD_PREFIX = ""


def register_fonts() -> None:
    fonts = {
        FONT: Path(r"C:\Windows\Fonts\arial.ttf"),
        FONT_BOLD: Path(r"C:\Windows\Fonts\arialbd.ttf"),
    }
    for name, path in fonts.items():
        if not path.exists():
            raise FileNotFoundError(f"Font lipsă: {path}")
        pdfmetrics.registerFont(TTFont(name, str(path)))


def rounded(c: canvas.Canvas, x: float, y: float, w: float, h: float, radius: float = 8,
            fill: Color = white, stroke: Color = LINE, width: float = 0.7) -> None:
    c.saveState()
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    c.restoreState()


def label(c: canvas.Canvas, text: str, x: float, y: float, color: Color = MUTED,
          size: float = 6.2) -> None:
    c.setFillColor(color)
    c.setFont(FONT_BOLD, size)
    c.drawString(x, y, text.upper())


def fit_text(c: canvas.Canvas, text: str, x: float, y: float, max_width: float,
             font: str = FONT_BOLD, size: float = 8.0, color: Color = INK) -> None:
    current = size
    while current > 5.8 and pdfmetrics.stringWidth(text, font, current) > max_width:
        current -= 0.2
    c.setFillColor(color)
    c.setFont(font, current)
    c.drawString(x, y, text)


def text_field(c: canvas.Canvas, name: str, x: float, y: float, w: float, h: float,
               value: str = "", font_size: float = 7.5, multiline: bool = False,
               border_color: Color = LINE_DARK, fill: Color = white,
               tooltip: str | None = None) -> None:
    c.acroForm.textfield(
        name=f"{FIELD_PREFIX}{name}",
        tooltip=tooltip or name,
        value=value,
        x=x,
        y=y,
        width=w,
        height=h,
        fontName="Helvetica",
        fontSize=font_size,
        textColor=INK,
        fillColor=fill,
        borderColor=border_color,
        borderWidth=0.65,
        borderStyle="solid",
        forceBorder=True,
        fieldFlags=4096 if multiline else 0,
    )


def labeled_field(c: canvas.Canvas, name: str, field_label: str, x: float, y: float,
                  w: float, h: float = 18, value: str = "", font_size: float = 7.5,
                  multiline: bool = False) -> None:
    label(c, field_label, x, y + h + 4)
    text_field(c, name, x, y, w, h, value=value, font_size=font_size, multiline=multiline,
               tooltip=field_label)


def checkbox(c: canvas.Canvas, name: str, text: str, x: float, y: float,
             checked: bool = False) -> float:
    c.acroForm.checkbox(
        name=f"{FIELD_PREFIX}{name}",
        tooltip=text,
        checked=checked,
        x=x,
        y=y,
        size=11,
        buttonStyle="check",
        borderWidth=0.8,
        borderColor=LINE_DARK,
        fillColor=white,
        textColor=ORANGE_DARK,
        forceBorder=True,
    )
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 6.4)
    c.drawString(x + 15, y + 2.5, text)
    return 15 + pdfmetrics.stringWidth(text, FONT_BOLD, 6.4)


def supplier_card(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    rounded(c, x, y, w, h, 9, ORANGE_SOFT, HexColor("#F3C996"), 0.8)
    c.setFillColor(ORANGE)
    c.roundRect(x, y, 4, h, 2, fill=1, stroke=0)
    label(c, "Furnizor / Expeditor", x + 14, y + h - 17, ORANGE_DARK)
    labeled_field(c, "supplier_name", "Denumire / Nume", x + 14, y + h - 49, w - 28, 18)
    gap = 8
    half = (w - 28 - gap) / 2
    labeled_field(c, "supplier_cui", "CUI / CNP", x + 14, y + h - 75, half, 16)
    labeled_field(c, "supplier_registration", "Reg. Com.", x + 14 + half + gap,
                  y + h - 75, half, 16)
    labeled_field(c, "supplier_address", "Sediu / Adresă expediere", x + 14, y + 7,
                  w - 28, 18)


def buyer_card(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    rounded(c, x, y, w, h, 9, white, LINE, 0.8)
    label(c, "Cumpărător / Destinatar", x + 14, y + h - 17, ORANGE_DARK)
    labeled_field(c, "buyer_name", "Nume client", x + 14, y + h - 49, w - 28, 18)
    labeled_field(c, "buyer_phone", "Număr de telefon", x + 14, y + h - 75, w - 28, 16)
    labeled_field(c, "buyer_address", "Adresă de livrare", x + 14, y + 7, w - 28, 18)


def header(c: canvas.Canvas, page_number: int, total_pages: int, continuation: bool = False) -> None:
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(ORANGE)
    c.rect(0, PAGE_H - 7, PAGE_W, 7, fill=1, stroke=0)

    c.drawImage(str(LOGO), 30, PAGE_H - 76, 50, 50, preserveAspectRatio=True, mask="auto")
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 15)
    c.drawString(94, PAGE_H - 54, "G-TROTS")

    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 17.5)
    c.drawRightString(PAGE_W - 30, PAGE_H - 43, "AVIZ DE ÎNSOȚIRE A MĂRFII")
    c.setFillColor(ORANGE_DARK)
    c.setFont(FONT_BOLD, 6.8)
    c.drawRightString(PAGE_W - 30, PAGE_H - 61, "COD 14-3-6A")
    c.setFillColor(MUTED)
    c.setFont(FONT_BOLD, 6.2)
    page_label = f"PAGINA {page_number} / {total_pages}"
    if continuation:
        page_label = f"CONTINUARE  ·  {page_label}"
    c.drawRightString(PAGE_W - 30, PAGE_H - 74, page_label)

    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(30, PAGE_H - 86, PAGE_W - 30, PAGE_H - 86)


def document_meta(c: canvas.Canvas) -> None:
    y = PAGE_H - 129
    label(c, "Identificarea documentului", 30, y + 32, ORANGE_DARK)
    labeled_field(c, "series", "Serie", 30, y, 88, 19, font_size=8.2)
    labeled_field(c, "number", "Număr", 128, y, 108, 19, font_size=8.2)
    labeled_field(c, "issue_date", "Data emiterii", 246, y, 102, 19, font_size=8.2)
    labeled_field(c, "order_reference", "Comandă / Factură de referință", 358, y,
                  PAGE_W - 388, 19, font_size=8.2)


def transport_section(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    rounded(c, x, y, w, h, 8, SURFACE, LINE, 0.7)
    label(c, "Date privind expediția", x + 12, y + h - 16, ORANGE_DARK)
    gap = 8
    field_y = y + 33
    widths = [180, 135, w - 24 - gap * 2 - 315]
    labels = ["Numele delegatului", "CI - serie și număr", "Mijloc transport / Nr."]
    names = ["delegate_name", "delegate_id", "vehicle_number"]
    cursor = x + 12
    for name, field_label, width in zip(names, labels, widths):
        labeled_field(c, name, field_label, cursor, field_y, width, 16, font_size=7.1)
        cursor += width + gap
    second_y = y + 7
    labeled_field(c, "shipping_time", "Ora livrării", x + 12, second_y, 70, 16, font_size=7.1)
    labeled_field(c, "loading_place", "Loc încărcare", x + 12 + 70 + gap, second_y,
                  w - 24 - 70 - gap, 16, font_size=7.1)


def reason_section(c: canvas.Canvas, x: float, y: float, w: float) -> None:
    rounded(c, x, y, w, 31, 8, ORANGE_SOFT, HexColor("#F1D0A6"), 0.7)
    cursor = x + 11
    cursor += checkbox(c, "reason_invoice_later", "Urmează factura", cursor, y + 10) + 14
    cursor += checkbox(c, "reason_no_invoice", "Fără factură", cursor, y + 10) + 14
    cursor += checkbox(c, "reason_processing", "Pentru prelucrare la terți", cursor, y + 10) + 14
    c.setFillColor(MUTED)
    c.setFont(FONT_BOLD, 6.2)
    c.drawString(cursor, y + 13, "ALTĂ CAUZĂ:")
    text_field(c, "other_reason", cursor + 64, y + 6, x + w - cursor - 75, 18,
               font_size=7.0, border_color=HexColor("#E4BD8D"), fill=white,
               tooltip="Altă cauză pentru emiterea avizului")


def items_table(c: canvas.Canvas, x: float, y_top: float, w: float, start_row: int,
                rows: int, row_h: float, show_total: bool) -> float:
    headers = ["Nr.", "Imagine", "Specificația produselor / mărfurilor", "U.M.",
               "Cantitate", "Preț unitar (lei)", "Valoare (lei)"]
    widths = [26, 48, 206, 43, 58, 79, w - 460]
    header_h = 27

    c.setFillColor(INK)
    c.roundRect(x, y_top - header_h, w, header_h, 7, fill=1, stroke=0)
    cursor = x
    for header_text, width in zip(headers, widths):
        c.setFillColor(white)
        c.setFont(FONT_BOLD, 5.8)
        if header_text in {"Nr.", "Imagine", "U.M.", "Cantitate"}:
            c.drawCentredString(cursor + width / 2, y_top - 17, header_text.upper())
        else:
            c.drawString(cursor + 7, y_top - 17, header_text.upper())
        cursor += width

    y = y_top - header_h
    for offset in range(rows):
        row = start_row + offset
        y -= row_h
        row_fill = white if row % 2 else SURFACE
        c.setFillColor(row_fill)
        c.setStrokeColor(LINE)
        c.rect(x, y, w, row_h, fill=1, stroke=1)
        cursor = x
        for index, width in enumerate(widths):
            if index:
                c.setStrokeColor(LINE)
                c.line(cursor, y, cursor, y + row_h)
            if index == 0:
                c.setFillColor(MUTED)
                c.setFont(FONT_BOLD, 6.8)
                c.drawCentredString(cursor + width / 2, y + row_h / 2 - 2.4, f"{row:02d}")
            elif index == 1:
                c.setStrokeColor(LINE_DARK)
                c.setLineWidth(0.55)
                c.roundRect(cursor + 6, y + 5, width - 12, row_h - 10, 3, fill=0, stroke=1)
            else:
                field_names = {2: "item", 3: "um", 4: "qty", 5: "unit_price", 6: "value"}
                align_font = 6.8 if index == 2 else 6.6
                text_field(c, f"{field_names[index]}_{row}", cursor + 1.5, y + 1.5,
                           width - 3, row_h - 3, font_size=align_font,
                           border_color=Color(1, 1, 1, alpha=0),
                           fill=row_fill,
                           tooltip=f"{headers[index]} - poziția {row}")
            cursor += width

    if not show_total:
        return y

    total_h = 24
    c.setFillColor(ORANGE_SOFT)
    c.setStrokeColor(HexColor("#EAC59A"))
    c.rect(x, y - total_h, w, total_h, fill=1, stroke=1)
    c.setFillColor(ORANGE_DARK)
    c.setFont(FONT_BOLD, 7)
    c.drawRightString(x + sum(widths[:-1]) - 9, y - 15.8, "TOTAL VALOARE")
    text_field(c, "total_value", x + sum(widths[:-1]) + 2, y - total_h + 2,
               widths[-1] - 4, total_h - 4, font_size=7.2,
               border_color=HexColor("#E5B87D"), fill=white, tooltip="Total valoare în lei")
    return y - total_h


def signatures(c: canvas.Canvas, x: float, y: float, w: float, h: float,
               with_stamp: bool) -> None:
    card_w = 230
    rounded(c, x, y, card_w, h, 8, white, LINE, 0.7)
    c.setFillColor(ORANGE)
    c.rect(x, y + h - 4, card_w, 4, fill=1, stroke=0)
    label(c, "Expeditor", x + 11, y + h - 17, ORANGE_DARK)
    labeled_field(c, "expeditor_name", "Nume și semnătură", x + 11, y + 12,
                  card_w - 22, 20, font_size=7.0)

    if with_stamp:
        stamp_w = 145
        stamp_x = x + w - stamp_w
        c.setFillColor(MUTED)
        c.setFont(FONT_BOLD, 7.2)
        c.drawString(stamp_x, y + h - 18, "ȘTAMPILĂ:")


def footer(c: canvas.Canvas) -> None:
    c.setFillColor(ORANGE)
    c.roundRect(30, 24, PAGE_W - 60, 2.2, 1.1, fill=1, stroke=0)


def draw_first_page(c: canvas.Canvas) -> None:
    header(c, 1, 2)
    document_meta(c)

    party_y = PAGE_H - 270
    gap = 10
    card_w = (PAGE_W - 60 - gap) / 2
    supplier_card(c, 30, party_y, card_w, 112)
    buyer_card(c, 30 + card_w + gap, party_y, card_w, 112)

    transport_section(c, 30, PAGE_H - 356, PAGE_W - 60, 78)
    items_table(c, 30, PAGE_H - 370, PAGE_W - 60, start_row=1,
                rows=9, row_h=42, show_total=False)
    footer(c)

    c.showPage()


def draw_continuation_page(c: canvas.Canvas, with_stamp: bool) -> None:
    header(c, 2, 2, continuation=True)
    document_meta(c)
    table_bottom = items_table(c, 30, PAGE_H - 158, PAGE_W - 60, start_row=10,
                               rows=10, row_h=42, show_total=True)
    labeled_field(c, "notes", "Observații privind livrarea / recepția", 30,
                  table_bottom - 38, PAGE_W - 60, 23, font_size=7.0, multiline=True)
    signatures(c, 30, 83, PAGE_W - 60, 63, with_stamp=with_stamp)
    footer(c)
    c.showPage()


def build_variant(path: Path, with_stamp: bool) -> None:
    global FIELD_PREFIX
    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle("Aviz de însoțire a mărfii G-Trots")
    c.setAuthor("G-Trots")
    c.setSubject("Aviz de însoțire a mărfii - Cod 14-3-6A")
    c.setCreator("G-Trots")

    FIELD_PREFIX = "p1_"
    draw_first_page(c)
    FIELD_PREFIX = "p2_"
    draw_continuation_page(c, with_stamp=with_stamp)
    c.save()


def build_pdf() -> None:
    build_variant(OUTPUT, with_stamp=True)
    build_variant(OUTPUT_NO_STAMP, with_stamp=False)
    print(OUTPUT)
    print(OUTPUT_NO_STAMP)


def main() -> None:
    register_fonts()
    if not LOGO.exists():
        raise FileNotFoundError(f"Logo lipsă: {LOGO}")
    build_pdf()


if __name__ == "__main__":
    main()
