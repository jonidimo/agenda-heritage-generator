import calendar

def generate_weekly_spread():
    html = """<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Heritage 2026 - Weekly Spread V2</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/layout.css">
    <style>
        /* PAGE 1: LEFT SIDE (Context & Hard Landscape) */
        .page-left {
            padding: 15mm 20mm 15mm 15mm;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        /* Header */
        .week-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2pt solid var(--ink-primary);
            padding-bottom: 2mm;
            margin-bottom: 5mm;
        }

        .header-title {
            display: flex;
            flex-direction: column;
        }
        .week-number { font-size: 24pt; }
        .week-month { font-size: 14pt; color: var(--ink-secondary); }

        .mini-calendar {
            width: 45mm;
            border: 0.5pt solid var(--ink-secondary);
            padding: 2mm;
        }
        .mini-row { display: flex; justify-content: space-between; font-size: 6pt; margin-bottom: 1pt; }
        .mini-cell { width: 4mm; text-align: center; }
        .current-week-row { background-color: #e0e0e0; border-radius: 2px; }

        /* Daily Rows (60% of page) */
        .daily-section {
            flex-grow: 1; /* Takes available space */
            display: flex;
            flex-direction: column;
            gap: 2mm;
        }

        .daily-row {
            height: 15mm;
            border-bottom: 0.25pt solid var(--ink-primary);
            display: flex;
            flex-direction: column;
        }
        
        .dot-grid-bg {
            /* State-of-the-art Premium Dot Grid */
            /* Very subtle, 1px dot, distinct but not overpowering */
            background-image: radial-gradient(circle, #d4d4d4 1px, transparent 1px);
            background-size: 5mm 5mm;
            background-position: 2.5mm 2.5mm; /* Offset to center in 5mm grid if needed, or align top-left */
            flex-grow: 1;
        }

        .day-label {
            font-family: 'Manrope', sans-serif;
            font-size: 8pt;
            font-weight: 800; /* Extra Bold */
            margin-bottom: 1mm;
            padding-top: 1mm;
        }

        /* Footer (15% approx) */
        .notes-footer {
            height: 15%; 
            margin-top: 5mm;
            border-top: 2pt solid var(--ink-primary);
            padding-top: 2mm;
        }
        .notes-header { font-size: 8pt; font-weight: bold; margin-bottom: 2mm; }
        .notes-lines {
            height: 100%;
            background-image: linear-gradient(to bottom, transparent 95%, #ddd 100%);
            background-size: 100% 6mm;
        }

        /* PAGE 2: RIGHT SIDE (Alastair Task Engine) */
        .page-right {
            padding: 15mm 15mm 15mm 20mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        /* Table */
        .alastair-container {
            flex-grow: 1;
        }

        table.alastair-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed; /* Crucial for print stability */
        }

        .alastair-table th {
            text-align: center;
            vertical-align: middle;
            border-bottom: 1pt solid var(--ink-primary);
            padding-bottom: 2mm;
            font-family: 'Manrope', sans-serif;
            font-size: 7pt;
        }
        
        .alastair-table th.task-header {
            text-align: left;
            width: 65%;
        }
        
        .alastair-table th.day-header {
            width: 5mm; /* Fixed width columns */
            border-left: 0.25pt solid var(--ink-primary);
        }

        .alastair-table td {
            height: 6mm; /* Row height */
            border-bottom: 0.25pt solid var(--grid-line-color);
            vertical-align: middle;
        }
        
        .alastair-table td.day-cell {
            border-left: 0.25pt solid var(--ink-primary); /* Vertical lines only for checkboxes */
            background-color: transparent;
        }
        .alastair-table tr:nth-child(even) {
            background-color: #fafafa;
        }

        .day-number { display: block; font-size: 6pt; margin-top: 1pt; color: var(--ink-secondary); }

        /* Footer */
        .finance-footer {
            height: 25mm;
            margin-top: 5mm;
            border-top: 1pt solid var(--ink-primary);
            padding-top: 2mm;
        }
        .finance-label { font-size: 8pt; font-weight: bold; }
        .finance-grid {
            display: grid;
            grid-template-columns: 1fr 20mm;
            row-gap: 2mm;
            margin-top: 2mm;
        }
        .finance-row { display: contents; }
        .finance-desc { border-bottom: 0.5pt dotted #ccc; height: 5mm; }
        .finance-amount { border-bottom: 0.5pt dotted #ccc; height: 5mm; margin-left: 2mm; }

    </style>
</head>
<body class="spread-container">

    <!-- LEFT PAGE -->
    <section class="page page-left">

        <header class="week-header">
            <div class="header-title">
                <div class="week-number label-caps text-sans">SEMANA 01</div>
                <div class="week-month text-serif">Diciembre / Enero</div>
            </div>
            
            <div class="mini-calendar">
                <div class="label-caps" style="text-align:center; margin-bottom:1mm;">ENERO 2026</div>
                <div class="mini-row"><span class="mini-cell">L</span><span class="mini-cell">M</span><span class="mini-cell">M</span><span class="mini-cell">J</span><span class="mini-cell">V</span><span class="mini-cell">S</span><span class="mini-cell">D</span></div>
                <div class="mini-row current-week-row">
                     <span class="mini-cell" style="opacity:0.5">29</span><span class="mini-cell" style="opacity:0.5">30</span><span class="mini-cell" style="opacity:0.5">31</span>
                     <span class="mini-cell">1</span><span class="mini-cell">2</span><span class="mini-cell">3</span><span class="mini-cell">4</span>
                </div>
                <div class="mini-row"><span class="mini-cell">5</span><span class="mini-cell">6</span><span class="mini-cell">7</span><span class="mini-cell">8</span><span class="mini-cell">9</span><span class="mini-cell">10</span><span class="mini-cell">11</span></div>
                <div class="mini-row"><span class="mini-cell">12</span><span class="mini-cell">13</span><span class="mini-cell">14</span><span class="mini-cell">15</span><span class="mini-cell">16</span><span class="mini-cell">17</span><span class="mini-cell">18</span></div>
                <div class="mini-row"><span class="mini-cell">19</span><span class="mini-cell">20</span><span class="mini-cell">21</span><span class="mini-cell">22</span><span class="mini-cell">23</span><span class="mini-cell">24</span><span class="mini-cell">25</span></div>
            </div>
        </header>

        <div class="daily-section">
            <!-- Monday 29 -->
            <div class="daily-row">
                <div class="day-label text-sans">LUN 29</div>
                <div class="dot-grid-bg"></div>
            </div>
            <!-- Tuesday 30 -->
            <div class="daily-row">
                <div class="day-label text-sans">MAR 30</div>
                <div class="dot-grid-bg"></div>
            </div>
            <!-- Wednesday 31 -->
            <div class="daily-row">
                <div class="day-label text-sans">MIE 31</div>
                <div class="dot-grid-bg"></div>
            </div>
            <!-- Thursday 01 -->
            <div class="daily-row">
                <div class="day-label text-sans">JUE 01</div>
                <div class="dot-grid-bg"></div>
            </div>
            <!-- Friday 02 -->
            <div class="daily-row">
                <div class="day-label text-sans">VIE 02</div>
                <div class="dot-grid-bg"></div>
            </div>
            <!-- Saturday 03 -->
            <div class="daily-row">
                <div class="day-label text-sans">SAB 03</div>
                <div class="dot-grid-bg"></div>
            </div>
            <!-- Sunday 04 -->
            <div class="daily-row" style="border-bottom:none;">
                <div class="day-label text-sans">DOM 04</div>
                <div class="dot-grid-bg"></div>
            </div>
        </div>

        <div class="notes-footer">
            <div class="notes-header label-caps">NOTAS</div>
            <div class="notes-lines"></div>
        </div>
    </section>

    <!-- RIGHT PAGE -->
    <section class="page page-right">
        <div class="alastair-container">
            <table class="alastair-table">
                <thead>
                    <tr>
                        <th class="task-header label-caps">TAREAS</th>
                        <th class="day-header label-caps">L<span class="day-number">29</span></th>
                        <th class="day-header label-caps">M<span class="day-number">30</span></th>
                        <th class="day-header label-caps">M<span class="day-number">31</span></th>
                        <th class="day-header label-caps">J<span class="day-number">01</span></th>
                        <th class="day-header label-caps">V<span class="day-number">02</span></th>
                        <th class="day-header label-caps" style="background-color:var(--weekend-fill);">S<span class="day-number">03</span></th>
                        <th class="day-header label-caps" style="background-color:var(--weekend-fill);">D<span class="day-number">04</span></th>
                    </tr>
                </thead>
                <tbody>
"""
    # 25 Empty Rows
    for _ in range(25):
        html += """
                    <tr>
                        <td></td>
                        <td class="day-cell"></td>
                        <td class="day-cell"></td>
                        <td class="day-cell"></td>
                        <td class="day-cell"></td>
                        <td class="day-cell"></td>
                        <td class="day-cell" style="background-color:var(--weekend-fill);"></td>
                        <td class="day-cell" style="background-color:var(--weekend-fill);"></td>
                    </tr>
        """
    html += """
                </tbody>
            </table>
        </div>

        <div class="finance-footer">
            <div class="finance-label label-caps">GASTOS RÁPIDOS</div>
            <div class="finance-grid">
                <div class="finance-row"><div class="finance-desc"></div><div class="finance-amount"></div></div>
                <div class="finance-row"><div class="finance-desc"></div><div class="finance-amount"></div></div>
                <div class="finance-row"><div class="finance-desc"></div><div class="finance-amount"></div></div>
            </div>
        </div>
    </section>

</body>
</html>
"""
    return html

with open("modules/weekly_spread.html", "w") as f:
    f.write(generate_weekly_spread())

print("Successfully generated modules/weekly_spread.html")
