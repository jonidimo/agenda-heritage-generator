def generate_trackers():
    html = """
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Heritage 2026 - Monthly Trackers</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/layout.css">
    <style>
        /* Left Page: Trackers */
        .page-left {
            padding: 15mm 20mm 15mm 15mm;
            display: flex;
            flex-direction: column;
            gap: 10mm;
        }
        
        .section-header {
            font-size: 14pt;
            border-bottom: 2pt solid var(--ink-primary);
            margin-bottom: 3mm;
        }
        
        /* Finance Table */
        .finance-table {
            width: 100%;
            border-collapse: collapse;
        }
        .finance-table th {
            text-align: left;
            font-size: 7pt;
            border-bottom: 1pt solid var(--ink-primary);
            padding: 1mm 0;
        }
        .finance-table td {
            height: 6mm;
            border-bottom: 0.25pt solid var(--grid-line-color);
        }

        .finance-summary {
            margin-top: 5mm;
            border: 0.5pt solid var(--ink-primary);
            padding: 3mm;
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        /* Habit Matrix */
        .habit-container {
            flex-grow: 1;
        }
        .habit-grid {
            display: grid;
            grid-template-columns: 35mm repeat(31, 1fr); /* Widened name column */
            gap: 1px;
            font-size: 6pt;
        }
        .habit-name {
            display: flex;
            align-items: center;
            border-bottom: 0.25pt solid #ccc;
            height: 7mm; /* Increased height from 5mm */
            padding-right: 2mm;
            font-size: 8pt; /* Writing space */
        }
        .habit-cell {
            border: 0.25pt solid #ddd;
            height: 7mm; /* Match name height */
        }
        
        /* Right Page: Review */
        .page-right {
           padding: 15mm 15mm 15mm 20mm;
           background-image: radial-gradient(#aaa 1px, transparent 1px);
           background-size: 5mm 5mm; /* Dot grid spacing */
           display: flex;
           flex-direction: column;
           gap: 15mm;
        }
        
        .review-section {
            background-color: rgba(252, 251, 244, 0.9); /* Slight overlay to make text readable over dots if needed, but per spec dots are bg */
            /* Spec says dots opacity 0.2. We simulate via color #ccc above, but let's stick to simple layout */
            padding: 2mm;
        }
        
        .prompt-title {
            font-size: 18pt;
            margin-bottom: 5mm;
            color: var(--accent-color);
        }
        
        .write-line {
            height: 8mm;
            border-bottom: 0.5pt solid var(--ink-primary);
            margin-bottom: 2mm;
        }

    </style>
</head>
<body>

    <!-- LEFT PAGE -->
    <section class="page page-left">
        
        <!-- Finance -->
        <div class="finance-section">
            <h2 class="section-header text-serif">Finanzas</h2>
            <table class="finance-table text-sans">
                <thead>
                    <tr>
                        <th class="label-caps" style="width:15%">FECHA</th>
                        <th class="label-caps" style="width:65%">DETALLE</th> <!-- Widened -->
                        <th class="label-caps" style="width:20%; text-align:right;">EGRESO ($)</th>
                    </tr>
                </thead>
                <tbody>
"""
    for _ in range(12): # Increased rows slightly as we have space
        html += """
                    <tr><td></td><td></td><td></td></tr>
        """
    html += """
                </tbody>
            </table>
            
            <div class="finance-summary text-sans">
                <span class="label-caps">INGRESOS DEL MES:</span>
                <span class="label-caps" style="color:var(--ink-secondary)">______________________</span>
            </div>
        </div>

        <!-- Habits -->
        <div class="habit-container">
            <h2 class="section-header text-serif">Hábitos</h2>
            <div class="habit-grid text-sans">
                <!-- Header Row -->
                <div></div> <!-- Empty top-left -->
"""
    for i in range(1, 32):
        html += f'<div style="text-align:center; display:flex; align-items:flex-end; justify-content:center;">{i}</div>'
    
    # 8 Habits (Reduced from 10)
    for h in range(1, 9):
        html += f'<div class="habit-name"></div>' # Blank for user to write
        for d in range(31):
            html += '<div class="habit-cell"></div>'

    html += """
            </div>
        </div>
    </section>

    <!-- RIGHT PAGE -->
    <section class="page page-right">
        <div class="review-section">
            <h2 class="prompt-title display-header">¿Qué logré este mes?</h2>
            <div class="write-line"></div>
            <div class="write-line"></div>
            <div class="write-line"></div>
            <div class="write-line"></div>
        </div>

        <div class="review-section">
            <h2 class="prompt-title display-header">Momentos para recordar</h2>
            <div class="write-line"></div>
            <div class="write-line"></div>
            <div class="write-line"></div>
            <div class="write-line"></div>
        </div>

        <div class="review-section">
            <h2 class="prompt-title display-header">Cosas que dejo ir</h2>
            <div class="write-line"></div>
            <div class="write-line"></div>
            <div class="write-line"></div>
        </div>
    </section>

</body>
</html>
"""
    return html

with open("modules/monthly_trackers.html", "w") as f:
    f.write(generate_trackers())

print("Successfully generated modules/monthly_trackers.html")
