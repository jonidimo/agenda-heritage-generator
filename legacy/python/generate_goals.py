def generate_goals_spread():
    html = """<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Heritage 2026 - Yearly Goals Strategy</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/layout.css">
    <style>
        /* Shared Styles */
        .page-container {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
        }
        
        .header-section {
            margin-bottom: 3mm; /* Reduced */
            border-bottom: 2pt solid var(--ink-primary);
            padding-bottom: 1mm;
        }
        
        .main-title {
            font-size: 20pt; /* Slightly smaller for space */
        }
        
        .sub-title {
            font-size: 8pt;
            color: var(--ink-secondary);
            margin-top: 0.5mm;
        }
        
        /* PAGE 1: The Matrix */
        .page-matrix {
            padding: 15mm 20mm 15mm 15mm; /* Left Page Margins */
            background-image: none !important;
        }
        
        .matrix-table {
            width: 100%;
            border-collapse: collapse;
            flex-grow: 1;
        }
        
        .matrix-table th {
            font-family: 'Manrope', sans-serif;
            font-size: 7pt;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            padding: 2mm;
            border-bottom: 0.5pt solid var(--ink-primary);
            border-right: 0.5pt solid var(--ink-primary);
        }
        .matrix-table th:last-child { border-right: none; }
        .matrix-table th:first-child { border-right: 0.5pt solid var(--ink-primary); width: 22mm; }
        
        .matrix-table td {
            vertical-align: top;
            padding: 1.5mm;
            border-right: 0.5pt solid var(--ink-primary);
            border-bottom: 0.5pt solid var(--ink-primary);
            height: 38mm; 
        }
        .matrix-table td:last-child { border-right: none; }
        .matrix-table tr:last-child td { border-bottom: none; }
        
        .category-label {
            font-family: 'Manrope', sans-serif;
            font-weight: 800;
            font-size: 8pt;
            text-transform: uppercase;
            text-align: right;
            padding-right: 2mm;
        }
        
        .dotted-line {
            height: 5mm; /* Reduced from 6mm */
            border-bottom: 0.5pt dotted #ccc;
            margin-bottom: 0.5mm;
        }
        
        /* PAGE 2: Action Plan */
        .page-action {
            padding: 15mm 15mm 15mm 20mm; /* Right Page Margins */
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            background-image: none !important;
        }
        
        .goal-block {
            border: 0.5pt solid var(--ink-primary);
            padding: 2mm 3mm; /* Reduced padding */
            display: flex;
            flex-direction: column;
            gap: 1mm; /* Tighter gap */
            margin-bottom: 0; 
            /* Height management handled by flex distribution in parent */
        }
        
        .goal-input-row {
            display: flex;
            align-items: baseline;
            gap: 2mm;
            border-bottom: 0.5pt solid var(--grid-line-color);
            padding-bottom: 0;
            height: 5mm; /* Fixed height for inputs */
        }
        
        .why-section {
            display: flex;
            flex-direction: column;
            gap: 0;
            margin-top: 1mm;
        }
        
        .how-section {
            display: grid;
            grid-template-columns: 1fr 20mm; /* Compressed Deadline box width */
            gap: 3mm;
            margin-top: 1mm;
        }
        
        .steps-list {
            display: flex;
            flex-direction: column;
            gap: 0.5mm;
        }
        
        .checkbox-row {
            display: flex;
            align-items: center;
            gap: 2mm;
            font-size: 8pt;
            height: 4mm;
        }
        
        .deadline-box {
            border: 0.5pt solid var(--ink-primary);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 1mm;
            align-self: flex-start;
            height: 14mm; /* Compact height */
        }
        
        .deadline-label {
            font-size: 5pt;
            text-transform: uppercase;
            margin-bottom: 1mm;
            text-align: center;
            line-height: 1;
        }
        
    </style>
</head>
<body class="spread-container" style="background-image: none !important;">

    <!-- PAGE 1: VISION (Left) -->
    <section class="page page-matrix">
        <header class="header-section">
            <h1 class="main-title display-header">Visión Anual</h1>
            <div class="sub-title text-sans">Define tus prioridades: Corto (1-3 meses), Mediano (6 meses), Largo (1 año).</div>
        </header>
        
        <table class="matrix-table text-sans">
            <thead>
                <tr>
                    <th></th> <!-- Corner -->
                    <th>CORTO PLAZO</th>
                    <th>MEDIANO PLAZO</th>
                    <th>LARGO PLAZO</th>
                </tr>
            </thead>
            <tbody>
                <!-- Rows fixed with updated labels and cleaner styling -->
                <tr>
                    <td style="vertical-align:middle;"><div class="category-label">PERSONAL</div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                </tr>
                <tr>
                    <td style="vertical-align:middle;"><div class="category-label">SALUD</div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                </tr>
                <tr>
                    <td style="vertical-align:middle;"><div class="category-label">TRABAJO<br>/HOGAR</div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                </tr>
                <tr>
                    <td style="vertical-align:middle;"><div class="category-label">FINANCIERO</div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                    <td><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div><div class="dotted-line"></div></td>
                </tr>
            </tbody>
        </table>
    </section>
    
    <!-- PAGE 2: ACTION PLAN (Right) -->
    <section class="page page-action">
        <header class="header-section">
            <h1 class="main-title display-header">Ingeniería de Acción</h1>
            <div class="sub-title text-sans">Planifica tus 3 objetivos principales para el año.</div>
        </header>

        <!-- Container for Goals -->
        <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
            
            <!-- Goal Block 1 -->
            <div class="goal-block">
                <div class="goal-input-row">
                    <span class="label-caps" style="width:22mm;">OBJETIVO 1:</span>
                    <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span>
                </div>
                
                <div class="why-section">
                    <span class="text-serif" style="font-style:italic; font-size:9pt; margin-bottom:1mm;">¿Por qué? (Motivación):</span>
                    <div class="dotted-line"></div>
                </div>
                
                <div class="how-section">
                    <!-- Left Col -->
                    <div style="display:flex; flex-direction:column; gap:1mm;">
                         <span class="text-serif" style="font-style:italic; font-size:9pt;">¿Qué necesito? (Recursos):</span>
                         <div class="dotted-line"></div>
                         
                         <div class="steps-list" style="margin-top:1mm;">
                             <span class="text-serif" style="font-style:italic; font-size:9pt;">Primeros Pasos:</span>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                         </div>
                    </div>
                    
                    <!-- Right Col -->
                    <div class="deadline-box">
                        <span class="deadline-label text-sans">FECHA<br>LÍMITE</span>
                        <span style="font-size:12pt; opacity:0.3;">/</span>
                    </div>
                </div>
            </div>

            <!-- Goal Block 2 -->
            <div class="goal-block">
                <div class="goal-input-row">
                    <span class="label-caps" style="width:22mm;">OBJETIVO 2:</span>
                    <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span>
                </div>
                
                <div class="why-section">
                    <span class="text-serif" style="font-style:italic; font-size:9pt; margin-bottom:1mm;">¿Por qué? (Motivación):</span>
                    <div class="dotted-line"></div>
                </div>
                
                <div class="how-section">
                    <div style="display:flex; flex-direction:column; gap:1mm;">
                         <span class="text-serif" style="font-style:italic; font-size:9pt;">¿Qué necesito? (Recursos):</span>
                         <div class="dotted-line"></div>
                         
                         <div class="steps-list" style="margin-top:1mm;">
                             <span class="text-serif" style="font-style:italic; font-size:9pt;">Primeros Pasos:</span>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                         </div>
                    </div>
                    <div class="deadline-box">
                        <span class="deadline-label text-sans">FECHA<br>LÍMITE</span>
                        <span style="font-size:12pt; opacity:0.3;">/</span>
                    </div>
                </div>
            </div>

            <!-- Goal Block 3 -->
            <div class="goal-block">
                <div class="goal-input-row">
                    <span class="label-caps" style="width:22mm;">OBJETIVO 3:</span>
                    <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span>
                </div>
                
                <div class="why-section">
                    <span class="text-serif" style="font-style:italic; font-size:9pt; margin-bottom:1mm;">¿Por qué? (Motivación):</span>
                    <div class="dotted-line"></div>
                </div>
                
                <div class="how-section">
                    <div style="display:flex; flex-direction:column; gap:1mm;">
                         <span class="text-serif" style="font-style:italic; font-size:9pt;">¿Qué necesito? (Recursos):</span>
                         <div class="dotted-line"></div>
                         
                         <div class="steps-list" style="margin-top:1mm;">
                             <span class="text-serif" style="font-style:italic; font-size:9pt;">Primeros Pasos:</span>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                             <div class="checkbox-row"><span style="font-size:10pt;">◯</span> <span style="border-bottom:0.5pt dotted #ccc; flex-grow:1;"></span></div>
                         </div>
                    </div>
                    <div class="deadline-box">
                        <span class="deadline-label text-sans">FECHA<br>LÍMITE</span>
                        <span style="font-size:12pt; opacity:0.3;">/</span>
                    </div>
                </div>
            </div>

        </div>

    </section>
</body>
</html>
"""
    return html

with open("modules/yearly_goals.html", "w") as f:
    f.write(generate_goals_spread())

print("Successfully generated modules/yearly_goals.html (Two Page Strategic Spread)")
