# Sistema de Gestión Hospitalaria Integral

Sistema web moderno y robusto diseñado para la administración eficiente de procesos clínicos y administrativos en instituciones de salud. Desarrollado con tecnologías de vanguardia para garantizar seguridad, escalabilidad y una experiencia de usuario intuitiva.

![Login Screen](public/login-bg.png)

## 📋 Descripción General

Esta plataforma ofrece una solución completa para el flujo de trabajo hospitalario, desde la admisión de pacientes hasta la facturación y farmacia. Está diseñado para facilitar la colaboración entre diferentes roles (médicos, enfermeras, recepción, administración) y optimizar la atención al paciente.

### ✨ Características Principales

*   **Gestión de Roles y Seguridad:**
    *   Autenticación segura mediante Firebase.
    *   Roles definidos: Administrador, Doctor, Recepcionista, Enfermera.
    *   Gestión de perfiles de usuario con soporte para firmas digitales y certificados (.p12).

*   **Admisión y Gestión de Pacientes:**
    *   Registro rápido de pacientes con generación de códigos de facturación.
    *   Historial médico digital con capacidad de adjuntar archivos.
    *   Clasificación de pacientes por origen (Propio, IGSS, Estado).

*   **Consultas Médicas y Estación del Doctor:**
    *   Flujo de trabajo guiado por pasos (Wizard): Diagnóstico, Exámenes, Receta, Finalización.
    *   Gestión de signos vitales.
    *   Generación de recetas médicas y órdenes de laboratorio.
    *   Sistema de referencias a especialidades y patologías.
    *   Soporte para firma digital de consultas.
    *   Asistencia IA (Gemini Service) para apoyo clínico.

*   **Farmacia e Inventario:**
    *   Control de stock de medicamentos en tiempo real.
    *   Gestión de costos y precios de venta.
    *   Alertas de stock bajo.
    *   Integración directa con el módulo de recetas.

*   **Administración y Contabilidad:**
    *   Dashboard contable con métricas clave.
    *   Auditoría de acciones del sistema.
    *   Generación de reportes financieros y operativos.
    *   Servicios de respaldo (Backup Service) y exportación a PDF/Excel.

*   **Comunicación y Notificaciones:**
    *   Sistema de notificaciones en tiempo real para el personal.
    *   Integración de correo electrónico para alertas y comunicaciones.

## 🛠️ Tecnologías Utilizadas

Este proyecto utiliza un stack moderno basado en React y el ecosistema de Vite, asegurando un alto rendimiento y facilidad de mantenimiento.

*   **Frontend Core:**
    *   [React](https://react.dev/) (v18) - Biblioteca principal de UI.
    *   [TypeScript](https://www.typescriptlang.org/) - Tipado estático para mayor robustez.
    *   [Vite](https://vitejs.dev/) - Entorno de desarrollo y bundler ultrarrápido.

*   **Estilos y UI:**
    *   [Tailwind CSS](https://tailwindcss.com/) - Framework de utilidades CSS.
    *   [Framer Motion](https://www.framer.com/motion/) - Animaciones fluidas.
    *   [Lucide React](https://lucide.dev/) - Iconografía moderna.
    *   [Sonner](https://sonner.emilkowal.ski/) - Notificaciones toast elegantes.

*   **Backend y Servicios:**
    *   [Firebase](https://firebase.google.com/) - Backend-as-a-Service (Auth, Firestore, Storage).
    *   [Zod](https://zod.dev/) & [React Hook Form](https://react-hook-form.com/) - Validación y manejo de formularios.

*   **Utilidades y Exportación:**
    *   [jsPDF](https://github.com/parallax/jsPDF) & [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable) - Generación de documentos PDF.
    *   [SheetJS (xlsx)](https://sheetjs.com/) - Manejo de hojas de cálculo Excel.
    *   [Node Forge](https://github.com/digitalbazaar/forge) - Criptografía y manejo de certificados.

## 🚀 Instalación y Despliegue

### Requisitos Previos
*   Node.js (versión LTS recomendada)
*   NPM o Yarn
*   Cuenta de Firebase configurada

### Pasos para Desarrollo Local

1.  **Clonar el repositorio:**
    ```bash
    git clone <url-del-repositorio>
    cd sistema-hospital-farmacia
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar variables de entorno:**
    Crea un archivo `.env` o configura `src/firebase/config.ts` con tus credenciales de Firebase.

4.  **Iniciar el servidor de desarrollo:**
    ```bash
    npm run dev
    ```

### Construcción para Producción

Para generar los archivos estáticos optimizados para producción:

```bash
npm run build
```

Los archivos se generarán en la carpeta `dist`.

## 📂 Estructura del Proyecto

```
src/
├── components/      # Componentes de UI reutilizables y módulos específicos
├── data/            # Datos estáticos (geografía, assets)
├── firebase/        # Configuración de Firebase
├── pages/           # Vistas principales de la aplicación (Router)
├── schemas/         # Esquemas de validación Zod
├── services/        # Lógica de negocio y comunicación con APIs
├── types.ts         # Definiciones de tipos TypeScript globales
└── ...
```

## 👥 Contribución

Este es un proyecto privado diseñado para uso institucional. Para proponer cambios o reportar errores, por favor contacte al equipo de desarrollo o cree un Issue en el repositorio.

---
© 2024 Sistema de Gestión Hospitalaria. Todos los derechos reservados.
