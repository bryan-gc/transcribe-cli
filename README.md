# CLI Audio Transcriber

Una aplicación de terminal (CLI) escrita en Node.js y TypeScript para grabar audio desde el micrófono y transcribirlo utilizando la API Whisper de OpenAI.

## Requisitos Previos del Sistema (Importante)

Para que Node.js pueda grabar audio desde tu micrófono, necesita apoyarse en herramientas del sistema operativo. Dependiendo de tu sistema, debes instalar lo siguiente **antes** de correr el proyecto:

### Linux (Ubuntu / Debian)
Necesitas instalar `sox` y las librerías de soporte de formatos de audio:
```bash
sudo apt-get update
sudo apt-get install sox libsox-fmt-all
```

### macOS
Puedes instalar `sox` usando Homebrew:
```bash
brew install sox
```

### Windows
1. Descarga los binarios de [SoX](https://sourceforge.net/projects/sox/).
2. Añade la carpeta donde extrajiste SoX a tu variable de entorno `PATH`.

---

## Instalación del Proyecto

1. Clona el repositorio o descarga los archivos.
2. Instala las dependencias de Node:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` basado en el `.env.example` y coloca tu API Key de OpenAI:
   ```env
   OPENAI_API_KEY=tu_api_key_aqui
   ```

## Uso

Para iniciar la aplicación, simplemente corre:
```bash
npm start
```

La aplicación mostrará un menú interactivo en la terminal. Puedes controlarlo de dos formas:
- **Flechas Direccionales:** Usa Arriba/Abajo para moverte y Enter para seleccionar una opción.
- **Atajos de Teclado:** Presiona `r` para grabar, `p` para pausar, `s` para detener y `t` para transcribir.
