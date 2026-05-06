# ⚡ FacturaYa — High-Fidelity Freelance OS

**FacturaYa** es una herramienta de facturación de alto rendimiento diseñada específicamente para autónomos que buscan una estética profesional, minimalista y extremadamente rápida. Olvida los formularios lentos y los diseños genéricos; FacturaYa ofrece una experiencia **Cyber-Premium** con generación instantánea de PDFs.

![Dashboard Preview](https://github.com/antoniotiradog05/FacturaYa/blob/main/public/preview.png?raw=true)

## ✨ Características Principales

- **🎨 Estética Neo-Brutalista**: Interfaz de alta fidelidad con animaciones fluidas mediante GSAP y tipografía técnica (JetBrains Mono + Inter).
- **📊 Cálculo en Tiempo Real**: Gestión automática de IVA (21%) e IRPF (15%) conforme a la normativa española.
- **📄 PDF Pro-Grade**: Generación de facturas en PDF con diseño impecable listas para enviar a clientes.
- **⚡ Flujo Ultra-Rápido**: Posibilidad de escribir el nombre del cliente directamente sin necesidad de registro previo (auto-creación).
- **🔒 Privacidad Local**: Los datos se almacenan localmente en una base de datos SQLite, garantizando que tu información financiera nunca salga de tu control.

## 🛠️ Tech Stack

- **Backend**: Node.js + Express
- **Base de Datos**: SQLite (Better-SQLite3)
- **PDF**: PDFKit
- **Frontend**: Vanilla JS + GSAP (GreenSock) + Lucide Icons
- **Estilos**: Custom CSS (Modern UI/UX)

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

## 📁 Estructura del Proyecto

- `/public`: Frontend SPA (HTML/CSS/JS).
- `server.js`: API REST y gestión de rutas.
- `pdf_service.js`: Lógica de generación de documentos PDF.
- `database.js`: Inicialización y esquema de SQLite.
- `database.sqlite`: Almacenamiento local de datos.

---
Diseñado con precisión por **Antonio Tirado** — Elevando la productividad del autónomo moderno.
