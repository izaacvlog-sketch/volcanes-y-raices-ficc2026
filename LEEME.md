# Revista Volcanes y Raíces — cómo publicar y usar el panel de administrador

## 1. Publicar la página en Vercel
Sube **toda esta carpeta** (no solo el index.html) con una de estas opciones:
- Terminal, dentro de la carpeta: `npx vercel --prod`
- O súbela a un repositorio de GitHub e impórtalo en vercel.com/new

## 2. Activar el almacenamiento para los PDF (una sola vez)
1. En Vercel abre tu proyecto → pestaña **Storage** → **Create** → **Blob**.
2. Elige acceso **Public** y conéctalo a este proyecto (crea solo la variable `BLOB_READ_WRITE_TOKEN`).

## 3. Crear tu contraseña de administrador (una sola vez)
1. Proyecto → **Settings** → **Environment Variables**.
2. Agrega `ADMIN_PASSWORD` con la contraseña que tú quieras (usa una larga, que no uses en otro lado).
3. Vuelve a desplegar el proyecto (Deployments → ⋯ → Redeploy) para que tome los cambios.

## 4. Subir una nueva edición
1. Entra a `https://tu-sitio.vercel.app/admin` (también hay un enlace discreto en el pie de página: “Acceso administrador”).
2. Escribe tu contraseña, elige el PDF, revisa la portada que aparece y pulsa **Publicar edición**.
3. En aproximadamente un minuto el flipbook y el botón “Descargar revista” muestran la nueva edición.

Notas:
- Cada PDF nuevo reemplaza al anterior.
- Máximo 300 MB por archivo; lo ideal es menos de 60 MB para que abra rápido en celulares.
- Mientras no se suba ninguna edición desde el panel, la página usa el `revista.pdf` incluido en esta carpeta.
- El formulario de contacto sigue enviando a revista.volcanesyraices@gmail.com (FormSubmit).

## Registro del FICC 2026
La sección "Festival Internacional del Café Cacahoatán 2026" envía cada registro a ficc.cacahoatan2026@gmail.com (FormSubmit).
La primera vez que alguien se registre con la página ya publicada, llegará a ese correo un mensaje de FormSubmit para activar el formulario: ábrelo y pulsa "Activate". Desde entonces todos los registros llegan solos, y cada persona registrada recibe una confirmación automática en su correo.
