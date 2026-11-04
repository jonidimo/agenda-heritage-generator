import calendar

def generate_month_html(year, month):
    # Spanish Month Names
    month_names = ["", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", 
                   "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
    
    html = f'<div class="month-container">\n'
    html += f'  <h3 class="month-name label-caps accent-text">{month_names[month]}</h3>\n'
    html += f'  <div class="month-grid">\n'
    
    # Day headers: L M M J V S D
    days = ["L", "M", "M", "J", "V", "S", "D"]
    for d in days:
        html += f'    <div class="day-header label-caps secondary-text">{d}</div>\n'
        
    cal = calendar.Calendar(firstweekday=0) # 0 = Monday
    for day in cal.itermonthdays(year, month):
        if day == 0:
            html += '    <div class="day-cell empty"></div>\n'
        else:
            # Check if weekend (Saturday=5, Sunday=6)
            # We need to know the weekday of this specific date
            weekday = calendar.weekday(year, month, day)
            is_weekend = (weekday >= 5)
            class_name = "day-cell weekend" if is_weekend else "day-cell"
            html += f'    <div class="{class_name} text-sans">{day}</div>\n'
            
    html += '  </div>\n' # End grid
    html += '</div>\n' # End month
    return html

def generate_year_page(year):
    html = f'<section class="page yearly-page" id="year-{year}">\n'
    html += f'  <h1 class="year-title display-header">{year}</h1>\n'
    html += '  <div class="year-grid">\n'
    
    for month in range(1, 13):
        html += generate_month_html(year, month)
        
    html += '  </div>\n'
    html += '</section>\n'
    return html

# Generate complete HTML
full_html = """
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Heritage 2026 - Yearly View</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/layout.css">
    <style>
        .yearly-page {
            padding: 20mm; /* Will rely on @page margins but good for preview */
            display: flex;
            flex-direction: column;
            justify-content: flex-start; /* Align into layout */
        }
        
        .year-title {
            text-align: center;
            font-size: 36pt;
            margin-bottom: 5mm;
            color: var(--ink-primary);
        }
        
        .year-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-template-rows: repeat(4, 1fr);
            column-gap: 5mm;
            row-gap: 8mm; /* Space between months */
            height: 85%; /* Fill remaining space */
        }
        
        .month-container {
            display: flex;
            flex-direction: column;
            gap: 1mm;
        }
        
        .month-name {
            text-align: center;
            margin-bottom: 1mm;
        }
        
        .month-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 1pt; /* Very tight */
        }
        
        .day-header, .day-cell {
            text-align: center;
            font-size: 5pt;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 3mm; /* Fixed height for consistency */
        }
        
        .day-header {
            font-weight: bold;
            margin-bottom: 1px;
        }
        
        .weekend {
            background-color: var(--weekend-fill);
            border-radius: 1px;
        }
    </style>
</head>
<body>
"""

full_html += generate_year_page(2026)
full_html += generate_year_page(2027)

full_html += "</body></html>"

with open("modules/yearly_view.html", "w") as f:
    f.write(full_html)

print("Successfully generated modules/yearly_view.html")
