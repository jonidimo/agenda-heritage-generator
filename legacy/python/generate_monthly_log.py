import calendar

def generate_monthly_log(year, month):
    # Setup
    month_name = "Enero" # Hardcoded for this specific task
    chapter_title = "CAPÍTULO UNO"
    
    html = """
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Heritage 2026 - Monthly Log</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/layout.css">
    <style>
        .monthly-log-page {
            display: flex;
            flex-direction: column;
            /* Reduced top/bottom padding to ensure fit. Original was 20mm 15mm 15mm 20mm */
            padding: 10mm 15mm 5mm 20mm; 
            height: 100vh;
        }
        
        .log-header {
            margin-bottom: 5mm; /* Reduced from 8mm */
            border-bottom: 2pt solid var(--ink-primary);
            padding-bottom: 1mm;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            flex-shrink: 0; /* Keep header from shrinking */
        }
        
        .month-title {
            font-size: 48pt;
            font-style: italic;
            color: var(--ink-primary);
            line-height: 0.8;
        }
        
        .chapter-label {
            font-size: 8pt;
            letter-spacing: 0.2em;
            color: var(--ink-secondary);
        }

        .log-list {
            display: flex;
            flex-direction: column;
            width: 100%;
            flex-grow: 1;
        }

        .log-row {
            display: flex;
            align-items: baseline; /* Align text baselines */
            padding: 0; /* Remove padding to save space */
            border-bottom: 0.25pt solid #e0e0e0;
            height: 4.8mm; /* Explicit height calculation needed. 150mm / 31 ~ 4.8mm */
        }

        .log-row.weekend {
            background-color: var(--weekend-fill);
            border-bottom: 0.25pt solid #d0d0d0;
        }

        .date-col {
            width: 8mm;
            font-family: 'Cormorant Garamond', serif;
            font-weight: 700;
            font-size: 11pt; /* Slightly smaller */
            text-align: right;
            padding-right: 3mm;
            line-height: 1;
        }

        .day-col {
            width: 6mm;
            font-family: 'Manrope', sans-serif;
            font-weight: 700;
            font-size: 7pt;
            text-transform: uppercase;
            color: var(--ink-secondary);
            line-height: 1;
        }

        .input-col {
            flex-grow: 1;
            border-bottom: 0.5pt solid var(--grid-line-color);
            height: 3.5mm; /* Visual line guide */
            margin-bottom: 1mm;
        }
        
        .holiday-marker {
            color: var(--accent-color);
        }
    </style>
</head>
<body class="spread-container">
    <section class="page monthly-log-page">
        <header class="log-header">
            <h1 class="month-title text-serif">Enero</h1>
            <span class="chapter-label text-sans">CAPÍTULO UNO</span>
        </header>

        <div class="log-list">
"""

    cal = calendar.Calendar(firstweekday=0)
    # Spanish day letters (Monday start)
    days_map = ["L", "M", "M", "J", "V", "S", "D"]
    
    for day in cal.itermonthdays(year, month):
        if day == 0: continue
        
        weekday = calendar.weekday(year, month, day)
        day_letter = days_map[weekday]
        is_weekend = (weekday >= 5)
        
        row_class = "log-row weekend" if is_weekend else "log-row"
        
        # Holiday formatting
        date_str = str(day)
        day_str = day_letter
        
        if day == 1: # Jan 1
             date_str =f'<span class="holiday-marker">{day}</span>'
             
        html += f"""
            <div class="{row_class}">
                <div class="date-col">{date_str}</div>
                <div class="day-col">{day_str}</div>
                <div class="input-col"></div>
            </div>
        """

    html += """
        </div>
    </section>
</body>
</html>
"""
    return html

with open("modules/monthly_log.html", "w") as f:
    f.write(generate_monthly_log(2026, 1))

print("Successfully generated modules/monthly_log.html")
