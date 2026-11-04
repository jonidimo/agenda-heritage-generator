import os
import datetime
import calendar
import base64
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

# Configuration
OUTPUT_DIR = "output"
OUTPUT_PDF = os.path.join(OUTPUT_DIR, "Agenda_Final_Print_Ready.pdf")

# Theme Configuration
THEME_NAME = "heritage"
BASE_THEME_PATH = os.path.join("themes", THEME_NAME)
TEMPLATES_DIR = os.path.join(BASE_THEME_PATH, "templates")
CSS_DIR = os.path.join(BASE_THEME_PATH, "css")
ASSETS_DIR = os.path.join(BASE_THEME_PATH, "assets")

# Spanish Locale Manually
MONTH_NAMES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]

ARGENTINE_HOLIDAYS_2026 = {
    (1, 1): "Año Nuevo",
    (2, 16): "Carnaval",
    (2, 17): "Carnaval",
    (3, 24): "Día de la Memoria",
    (4, 2): "Malvinas",
    (4, 3): "Viernes Santo",
    (5, 1): "Día del Trabajador",
    (5, 25): "Revolución de Mayo",
    (6, 15): "Güemes (Trasl.)",
    (6, 20): "Día de la Bandera",
    (7, 9): "Día de la Independencia",
    (8, 17): "Gral. San Martín",
    (10, 12): "Diversidad Cultural",
    (11, 23): "Soberanía Nacional",
    (12, 8): "Inmaculada Concepción",
    (12, 25): "Navidad"
}

ES_DAYS_MAP = {
    'Monday': 'LUN', 'Tuesday': 'MAR', 'Wednesday': 'MIÉ', 'Thursday': 'JUE', 
    'Friday': 'VIE', 'Saturday': 'SÁB', 'Sunday': 'DOM'
}
ES_SHORT_MAP = {
    'Monday': 'L', 'Tuesday': 'M', 'Wednesday': 'M', 'Thursday': 'J', 
    'Friday': 'V', 'Saturday': 'S', 'Sunday': 'D'
}

def get_master_css(colibri_b64=""):
    path = os.path.join(CSS_DIR, "master_style.css")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            # Inject Base64 SVG into the CSS placeholder if present
            if colibri_b64:
                css_svg_url = f"url('data:image/svg+xml;base64,{colibri_b64}')"
                content = content.replace("REPLACE_WITH_COLIBRI_SVG", css_svg_url)
            return content
    return ""

def extract_body_content(html_source):
    if "<body" in html_source:
        start = html_source.find("<body")
        start = html_source.find(">", start) + 1
        end = html_source.find("</body>")
        return html_source[start:end]
    return html_source

def get_weeks_in_month(year, month):
    c = calendar.Calendar(firstweekday=0)
    month_days = c.monthdatescalendar(year, month)
    weeks = []
    
    for week in month_days:
        thursday = week[3]
        if thursday.month == month:
            week_data = {
                "number": thursday.isocalendar()[1],
                "month_label": f"{MONTH_NAMES[week[0].month]} / {MONTH_NAMES[week[-1].month]}" if week[0].month != week[-1].month else MONTH_NAMES[week[0].month],
                "days": []
            }
            for d in week:
                holiday = ARGENTINE_HOLIDAYS_2026.get((d.month, d.day))
                week_data["days"].append({
                    "name": d.strftime("%A"),
                    "name_short": ES_DAYS_MAP[d.strftime("%A")],
                    "day_num": d.day,
                    "is_weekend": d.weekday() >= 5,
                    "holiday_name": holiday,
                    "date": d # NEW: store full date
                })
            weeks.append(week_data)
    return weeks

def get_days_list(year, month):
    c = calendar.Calendar(firstweekday=0)
    days = []
    for d in c.itermonthdates(year, month):
        if d.month == month:
            holiday = ARGENTINE_HOLIDAYS_2026.get((d.month, d.day))
            days.append({
                "name": d.strftime("%A"),
                "name_short": ES_DAYS_MAP[d.strftime("%A")],
                "day_num": d.day,
                "is_weekend": d.weekday() >= 5,
                "holiday_name": holiday
            })
    return days

def get_days_31_list(year, month):
    # Returns 31 days starting from the 1st of the month
    # Used for the Habit Tracker to ensure all 31 columns are present and correctly labeled
    days = []
    current_date = datetime.date(year, month, 1)
    for i in range(31):
        # We handle month rollover by just continuing the dates
        d = current_date + datetime.timedelta(days=i)
        holiday = ARGENTINE_HOLIDAYS_2026.get((d.month, d.day))
        days.append({
            "name": d.strftime("%A"),
            "name_short": ES_DAYS_MAP[d.strftime("%A")],
            "day_num": d.day,
            "is_weekend": d.weekday() >= 5,
            "holiday_name": holiday,
            "is_current_month": d.month == month
        })
    return days

def get_mini_calendar_html(year, month, current_week_days):
    """Generates an HTML snippet for a 2-WEEK view (Current + Next) using a rigid table."""
    monday_date = current_week_days[0]['date']
    
    html = '<table class="mini-calendar" style="width: 44mm; border-collapse: collapse; margin-top: 1mm; table-layout: fixed;">'
    
    # Header days (L M M J V S D)
    html += '<tr style="border-bottom: 0.5pt solid #000;">'
    for day in ["L", "M", "M", "J", "V", "S", "D"]:
        html += f'<td style="width: 6.2mm; text-align: center; font-size: 9pt; font-weight: 800; padding: 0.5mm 0;">{day}</td>'
    html += '</tr>'
    
    # Two weeks: Current and Next
    for week_idx in range(2):
        is_current = (week_idx == 0)
        # Highlight current week with bold/underline or simple indicator
        row_style = "font-weight: 800; text-decoration: underline;" if is_current else "font-weight: 400;"
        html += f'<tr style="{row_style}">'
        
        for day_idx in range(7):
            d = monday_date + datetime.timedelta(days=(week_idx * 7) + day_idx)
            # Use font-weight instead of light gray to indicate off-month dates
            style = "font-weight: 800; color: #000;" if d.month == month else "font-weight: 300; color: #000;"
            html += f'<td style="text-align: center; font-size: 9pt; {style} padding: 1mm 0;">{d.day}</td>'
        html += '</tr>'
    
    html += '</table>'
    return html

MONTHLY_PHRASES = [
    "",
    "365 días por delante. Empezar de cero, una vez más.",
    "Días de verano. Tiempo para lo que te gusta.",
    "21 de marzo: Comienza el otoño. Cosechar lo sembrado.",
    "Anotar lo importante, organizar el resto.",
    "Días frescos. El placer de estar en casa.",
    "21 de junio: Comienza el invierno. Pausa y reflexión.",
    "El valor de lo analógico: papel, lápiz y tiempo.",
    "Nuevos planes para la segunda mitad del año.",
    "21 de septiembre: Comienza la primavera. Tiempo de florecer.",
    "1 de Octubre: Tu día. ¡Feliz Cumpleaños, Norma!",
    "Registrar los logros. Gratitud por lo vivido.",
    "Últimos 31 días. Brindar por lo que pasó."
]

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    
    # SVG Encoding for Watermark (Ensure it reads from the root)
    colibri_b64 = ""
    root_dir = os.path.dirname(os.path.abspath(__file__))
    colibri_path = os.path.join(root_dir, ASSETS_DIR, "colibri.svg")
    
    if os.path.exists(colibri_path):
        with open(colibri_path, "rb") as f:
            colibri_b64 = base64.b64encode(f.read()).decode('utf-8')
        print(f"Loaded Colibri from {colibri_path}")
    else:
        print(f"WARNING: Colibri not found at {colibri_path}")
    
    master_css = get_master_css(colibri_b64)
    master_body = ""
    page_count = 0
    
    def append_page(template_name, context={}, expected_pages=1):
        nonlocal page_count, master_body
        tmpl = env.get_template(template_name)
        rendered = tmpl.render(**context)
        body_content = extract_body_content(rendered)
        master_body += f"\n<!-- {template_name} -->\n{body_content}"
        page_count += expected_pages
        print(f"Added {template_name} ({expected_pages} pgs). Total: {page_count}")

    # 1. Start - Intro Page (Cover + Inspirational Intro)
    append_page("intro_view.html", expected_pages=2)
    
    # Yearly view is 4 pages (2026 + 2027)
    append_page("yearly_view.html", expected_pages=4)

    # Yearly Vision Matrix (2 pages)
    append_page("yearly_vision_v2.html", expected_pages=2)

    # Action Plan (2 pages)
    append_page("action_plan_v2.html", expected_pages=2)
    
    # 2. Monthly Loop
    year = 2026
    for month in range(1, 13):
        # Pagination: Monthly Cover MUST start on an ODD page (Right side)
        # page_count tracks total pages added so far. 
        # If page_count is even, the next page (page_count + 1) is ODD.
        # So if page_count is ODD, the next page is EVEN, so we need a filler.
        if page_count % 2 != 0:
            print(f"Inserting filler at page {page_count+1} to ensure cover is on ODD page.")
            append_page("dot_grid.html", expected_pages=1)
            
        month_name = MONTH_NAMES[month]
        next_month_idx = month + 1 if month < 12 else 1
        next_month_name = MONTH_NAMES[next_month_idx]
        
        days_list = get_days_list(year, month)
        weeks = get_weeks_in_month(year, month)
        
        # Consistent week header data
        week_days_short = ["L", "M", "M", "J", "V", "S", "D"]

        context = {
            "month_name": month_name,
            "next_month_name": next_month_name,
            "monthly_phrase": MONTHLY_PHRASES[month],
            "year": year,
            "days_list": days_list,
            "days_31": get_days_31_list(year, month),
            "week_days_short": week_days_short,
            "es_days_map": ES_DAYS_MAP,
            "es_short_map": ES_SHORT_MAP,
            "colibri_b64": colibri_b64
        }
        
        # Monthly Cover (The "Frame of Silence")
        append_page("monthly_cover.html", context, expected_pages=1)
        
        # Dot Grid page after monthly cover
        append_page("dot_grid.html", context, expected_pages=1)
        
        # Monthly Log
        append_page("monthly_log.html", context, expected_pages=1)
        
        # Weekly Spreads
        for w in weeks:
            mini_calendar_html = get_mini_calendar_html(year, month, w['days'])
            week_context = {
                "week": w,
                "month_name": month_name,
                "mini_calendar_html": mini_calendar_html,
                "week_days_short": week_days_short,
                "es_days_map": ES_DAYS_MAP,
                "es_short_map": ES_SHORT_MAP
            }
            append_page("weekly_spread.html", week_context, expected_pages=2)
            
        # Trackers, Review & Extras
        append_page("monthly_trackers.html", context, expected_pages=1)
        append_page("monthly_review.html", context, expected_pages=1)
        append_page("habit_tracker_extra.html", context, expected_pages=1)
        append_page("dot_grid.html", context, expected_pages=1)

        # FINAL PAGINATION CHECK: New month must start on an ODD page (Right)
        # page_count tracks total pages. If page_count is ODD, the next page (page_count+1) is EVEN (Left side).
        # We need the next page to be ODD (Right side), so if page_count is ODD, we add a footer.
        if page_count % 2 != 0:
            print(f"Adding extra dot_grid at page {page_count+1} to align next month cover on ODD page.")
            append_page("dot_grid.html", context, expected_pages=1)

        print(f"--- Completed {month_name}: Total Page Count: {page_count} ---")

    # 3. End - Passwords and Contacts (2 pages)
    append_page("passwords_contacts.html", expected_pages=2)
    while page_count % 4 != 0: # Round to signature
        append_page("dot_grid.html", expected_pages=1)
        
    final_html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <style>
            {master_css}
        </style>
    </head>
    <body>
        {master_body}
    </body>
    </html>
    """
    
    print("Rendering PDF with WeasyPrint...")
    HTML(string=final_html).write_pdf(OUTPUT_PDF)
    print(f"Success! PDF is vector-perfect and aligned for French Link Stitch binding.")
    print(f"Final PDF: {OUTPUT_PDF}")
    print(f"Final Page Count: {page_count}")

if __name__ == "__main__":
    main()
