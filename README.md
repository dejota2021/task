# TaskPro 3D · Tablero Kanban Colaborativo en Tiempo Real

¡Bienvenido a **TaskPro 3D**, la herramienta definitiva para organizar, colaborar e impulsar la productividad de tus equipos con una interfaz inmersiva tridimensional de última generación!

## 🚀 Características Principales

*   **⚡ Sincronización en Tiempo Real**: Desarrollado sobre Google Cloud Firebase Firestore, permitiendo que múltiples usuarios editen, organicen y muevan tareas de manera colaborativa e instantánea.
*   **📐 Interfaz Tridimensional (3D Depth)**: Columnas con perspectiva 3D interactiva que se inclinan (`perspective`, `rotateX`, `rotateY`) y se elevan en el eje Z al pasar el cursor, complementado con tarjetas parallax flotantes.
*   **🔄 Transición de Hojas Bidireccional**: Animación cinemática fluida al cambiar de tableros. Detecta la dirección de navegación (deslizándose de izquierda a derecha o viceversa) con rotaciones 3D.
*   **⌨️ Atajos de Escritorio (`Shift + A`)**: Diseñado para una productividad veloz. Abre el formulario de creación de tareas de forma instantánea pulsando `Shift + A` desde cualquier sección de la interfaz (desactivado automáticamente al escribir en inputs).
*   **🔊 Feedback de Sonido**: Efectos de sonido lúdicos ("Pop" e interactivos) con opción de apagado rápido desde la cabecera.
*   **🎨 Personalización Total**: Crea, edita o elimina columnas y tableros ("hojas") completamente desde cero, sin limitaciones.
*   **🏆 Ludificación (Gamification)**: Sistema integrado de acumulación de puntos de experiencia (XP), niveles dinámicos y medallas que recompensan el trabajo completado.

---

## 🛠️ Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

*   [Node.js](https://nodejs.org/) (versión 18 o superior recomendada)
*   [npm](https://www.npmjs.com/) (incluido con Node.js)

---

## 🚀 Instalación y Configuración Local

Sigue estos sencillos pasos para tener tu servidor local corriendo en minutos:

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/taskpro-3d.git
cd taskpro-3d
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar tus credenciales de Firebase
Modifica el archivo `firebase-applet-config.json` en la raíz del proyecto para añadir las credenciales de tu proyecto de Firebase:

```json
{
  "projectId": "tu-proyecto-id",
  "appId": "tu-app-id",
  "apiKey": "tu-api-key",
  "authDomain": "tu-proyecto.firebaseapp.com",
  "databaseURL": "https://tu-proyecto-default-rtdb.firebaseio.com",
  "storageBucket": "tu-proyecto.firebasestorage.app",
  "messagingSenderId": "tu-sender-id"
}
```

### 4. Lanzar el Servidor de Desarrollo
```bash
npm run dev
```

La aplicación estará lista y sirviéndose en: `http://localhost:3000` 🚀

---

## 📦 Construcción para Producción

Para compilar el proyecto optimizado y listo para ser subido a producción (Netlify, Vercel, Firebase Hosting o GitHub Pages):

```bash
npm run build
```

Este comando generará una carpeta `dist/` ultraligera con todo el HTML, CSS y JS optimizado para una carga instantánea.

---

## 🛡️ Reglas de Seguridad de Firestore

Asegúrate de que tu base de datos de Firebase Firestore permita la lectura y escritura de tus tableros. Puedes configurar las siguientes reglas en tu consola de Firebase:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

---

## 📝 Licencia

Este proyecto es de código abierto y está optimizado para su despliegue independiente. ¡Siéntete libre de modificarlo, adaptarlo y expandirlo para tus proyectos personales o profesionales!
