# 💎 FacturaYa Pro v2 — Freelance Fintech OS

**FacturaYa Pro v2** es la evolución definitiva en gestión financiera para autónomos. Transformada de una simple herramienta de facturación a una **Suite Fintech completa**, ofrece una experiencia de usuario premium con estética **Glassmorphism**, animaciones líquidas y herramientas de análisis de negocio de alto nivel.

![Version](https://img.shields.io/badge/Version-2.0.1_PRO-blueviolet?style=for-the-badge)
![Tech](https://img.shields.io/badge/Stack-Node.js_|_GSAP_|_SQLite-00d2ff?style=for-the-badge)

---

## 🚀 Novedades en Pro v2

### 📊 Business Intelligence & Dashboard
- **Profit Meter**: Visualización en tiempo real del beneficio neto proyectado (Ingresos - Gastos - Impuestos).
- **Smart KPIs**: Seguimiento de Margen de Beneficio, Ticket Medio y Ratio de Gastos.
- **Sales Goal Tracker**: Widget dinámico en la barra lateral para seguimiento de objetivos mensuales.

### 🏛️ Tax Center & Compliance
- **Reportes Trimestrales**: Cálculo automático de Modelos 303 (IVA) y 130 (IRPF).
- **Cash Flow Manager**: Registro de gastos deducibles y movimientos de caja sin factura.
- **Exportación Pro**: Exportación de historial a CSV con codificación compatible para Excel/Google Sheets.

### 🎨 Experiencia de Usuario "Liquid"
- **GSAP Animations**: Transiciones fluidas entre vistas y efectos de inclinación (Tilt & Glare) interactivos.
- **Full Editing**: Sistema avanzado de edición y duplicación de facturas existentes.
- **Brand Identity**: Soporte para logotipos personalizados en el encabezado de los PDFs generados.

---

## ✨ Características Core

- **🎨 Estética Premium**: Interfaz de alta fidelidad con tipografía técnica y modo oscuro profundo.
- **📊 Gestión de Clientes**: Insights detallados por cliente, incluyendo LTV (Lifetime Value).
- **📄 PDF Engine**: Generación instantánea de facturas con diseño profesional y logo dinámico.
- **🔒 Privacy First**: Almacenamiento local mediante SQLite. Tus datos financieros nunca salen de tu máquina.

---

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite (Better-SQLite3)
- **Engine**: GreenSock (GSAP 3) para animaciones de alto rendimiento.
- **UI**: Vanilla JS + CSS Moderno + Lucide Icons.

---

## 🚀 Instalación y Uso

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/antoniotiradog05/FacturaYa.git
   cd FacturaYa
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Iniciar la aplicación**:
   ```bash
   npm start
   ```

4. **Acceder**:
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 📁 Estructura del Proyecto

- `/public`: Frontend SPA (HTML/CSS/JS) con lógica de animaciones GSAP.
- `server.js`: API REST con endpoints avanzados para exportación y estadísticas.
- `pdf_service.js`: Motor de renderizado PDF con soporte para imágenes Base64.
- `database.js`: Gestión de esquema evolutivo y persistencia SQLite.

---

Developed with precision by **Antonio Tirado** — *The future of freelance finance is here.*
