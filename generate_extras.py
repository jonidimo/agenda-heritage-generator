def generate_extras():
    common_head = """<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Heritage 2026 - Extras</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/layout.css">
    <style>
        /* Specific Styles for Extras */
        
        .extras-page {
            padding: 15mm 20mm;
        }
        .pwd-table {
            width: 100%;
            border-collapse: collapse;
        }
        .pwd-table th {
            text-align: left;
            border-bottom: 1pt solid var(--ink-primary);
            font-family: 'Manrope', sans-serif;
            font-size: 8pt;
            padding-bottom: 2mm;
        }
        .pwd-table td {
            height: 10mm; /* Generous height */
            border-bottom: 0.25pt solid #ccc;
        }
        
        .contacts-section {
            margin-bottom: 10mm;
        }
        .contact-header {
            font-family: 'Cormorant Garamond', serif;
            font-size: 18pt;
            border-bottom: 1pt solid var(--ink-primary);
            margin-bottom: 3mm;
        }
        .contact-row {
            height: 8mm;
            border-bottom: 0.25pt solid #ddd;
            margin-bottom: 1mm;
        }

    </style>
</head>
<body class="spread-container">
"""
    # 1. Yearly Goals
    html_goals = common_head + f"""
    <section class="page goals-page">
        <div class="goal-quadrant">
            <div class="goal-title">Salud</div>
            <div class="goal-lines"></div>
        </div>
        <div class="goal-quadrant">
            <div class="goal-title">Familia</div>
            <div class="goal-lines"></div>
        </div>
        <div class="goal-quadrant">
            <div class="goal-title">Hogar</div>
            <div class="goal-lines"></div>
        </div>
        <div class="goal-quadrant">
            <div class="goal-title">Personal</div>
            <div class="goal-lines"></div>
        </div>
    </section>
    </body></html>
    """
    
    # 2. Monthly Review
    html_review = common_head + f"""
    <section class="page review-page">
        <div class="review-box-large">
            <span class="box-title">Logros del Mes</span>
        </div>
        <div class="review-box-large">
            <span class="box-title">Gratitud / Momentos</span>
        </div>
        <div class="review-box-small">
            <span class="box-title">Pendiente para el próximo mes</span>
        </div>
    </section>
    </body></html>
    """

    # 3. Dot Grid
    html_dots = common_head + f"""
    <section class="page dot-page">
        <!-- Just dots background -->
    </section>
    </body></html>
    """

    # 4. Passwords
    html_pwds = common_head + f"""
    <section class="page extras-page">
        <h1 class="display-header" style="margin-bottom:5mm; font-size:24pt;">Contraseñas</h1>
        <table class="pwd-table text-sans">
            <thead>
                <tr>
                    <th style="width:40%">PLATAFORMA</th>
                    <th style="width:30%">USUARIO</th>
                    <th style="width:30%">PISTA / CLAVE</th>
                </tr>
            </thead>
            <tbody>
"""
    for _ in range(12):
        html_pwds += "<tr><td></td><td></td><td></td></tr>"
    
    html_pwds += f"""
            </tbody>
        </table>
    </section>
    <section class="page extras-page" style="break-before:always">
        <h1 class="display-header" style="margin-bottom:5mm; font-size:24pt;">Contactos</h1>
        
        <div class="contacts-section">
            <div class="contact-header">Médicos</div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
        </div>
        
        <div class="contacts-section">
            <div class="contact-header">Emergencias</div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
        </div>
        
        <div class="contacts-section">
            <div class="contact-header">Servicios</div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
        </div>
        
        <div class="contacts-section">
            <div class="contact-header">Familiares</div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
        </div>

        <div class="contacts-section">
            <div class="contact-header">Otros</div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
            <div class="contact-row"></div>
        </div>
    </section>
    </body></html>
    """

    # Write Files
    with open("modules/yearly_goals.html", "w") as f: f.write(html_goals)
    with open("modules/monthly_review.html", "w") as f: f.write(html_review)
    with open("modules/dot_grid.html", "w") as f: f.write(html_dots)
    with open("modules/passwords_contacts.html", "w") as f: f.write(html_pwds)
    
    print("Generated Extras: modules/yearly_goals.html, modules/monthly_review.html, modules/dot_grid.html, modules/passwords_contacts.html")

generate_extras()
