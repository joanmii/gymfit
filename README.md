# GymFit 💪

App para iPhone (web instalable) con:

- **Calendario** para marcar si fuiste al gimnasio, qué rutina hiciste y qué grupos musculares entrenaste.
- **Rutinas** con series, repeticiones y kilos, más una **biblioteca de ejercicios** con mapa muscular: toca un músculo del cuerpo (delante o detrás) y verás sus ejercicios. Cada ejercicio muestra las zonas que trabaja (principales y secundarias), cómo se hace, consejos y un botón para ver vídeos de la técnica en YouTube.
- **Modo entrenar**: pulsa "Empezar entreno" en una rutina y ve marcando cada serie con sus kilos y repeticiones (se rellenan con lo de la última vez). Tiene cronómetro, temporizador de descanso con pitido y, al terminar, un resumen con tus nuevos récords. El día se marca solo en el calendario.
- **Estadísticas** semanales, mensuales y anuales: días entrenados, asistencia, rachas, reparto por músculo, mapa de calor del año y **progreso por ejercicio** (récord, 1RM estimado y gráfica de cómo suben tus pesos).
- **Nutrición**, con cinco formas de apuntar lo que comes:
  - 📷 **Foto** del plato: la IA (Gemini gratis, o Claude) estima calorías y macros.
  - 🎙️ **Describir** por texto o voz: "dos huevos fritos con una tostada y un café con leche".
  - 🏷️ **Código de barras** de productos envasados: datos exactos de [Open Food Facts](https://world.openfoodfacts.org) (gratis, sin clave).
  - ↩️ **Repetir** una comida reciente con un toque.
  - ✍️ **A mano**, sin IA.
- **Peso** (en Nutrición → ⚖️ Peso): último peso, cambio a 7 y 30 días, ritmo en kg/semana, IMC, progreso hacia tu peso objetivo, gráfica (30 días a todo el historial) y composición corporal (grasa, músculo, agua, grasa visceral, hueso, metabolismo). Se importa de la báscula Xiaomi (ver sección 7).

No necesita Mac, ni Xcode, ni cuenta de Apple Developer. Todos los datos se guardan en tu iPhone.

---

## 1. Abrir el proyecto en VS Code

1. Descomprime `gymfit.zip`.
2. En VS Code: **Archivo → Abrir carpeta…** y elige la carpeta `gymfit`.
3. Abre la terminal de VS Code (**Ver → Terminal**).

## 2. Probarla en tu PC

```bash
python serve.py
```

Se abre `http://localhost:8000` en el navegador. Para verla con forma de móvil, pulsa **F12** y activa el modo dispositivo (icono de móvil/tablet) eligiendo "iPhone".

Cada vez que guardes un cambio en VS Code, recarga la página.

## 3. Probarla en el iPhone (misma WiFi)

Con `python serve.py` en marcha, la terminal muestra una línea `En el iPhone: http://192.168.x.x:8000`. Ábrela en Safari del iPhone.

- Si Windows pregunta por el firewall, pulsa **Permitir acceso** en redes privadas.
- Así puedes probar todo, pero para instalarla de verdad (que funcione fuera de casa y sin conexión) publícala como en el paso 4.

## 4. Publicarla gratis con GitHub Pages

1. Crea una cuenta en [github.com](https://github.com) y un repositorio nuevo llamado `gymfit` (público).
2. Pulsa **Add file → Upload files** y arrastra **todo el contenido** de la carpeta (no la carpeta en sí: `index.html` debe quedar en la raíz). Pulsa **Commit changes**.
3. Ve a **Settings → Pages**. En *Branch* elige `main` y `/ (root)`, y pulsa **Save**.
4. En 1–2 minutos tendrás tu app en `https://TU-USUARIO.github.io/gymfit/`.

> Tu clave de la API **no** está en el código, así que el repositorio puede ser público sin problema.

Para actualizarla: sube los archivos cambiados de la misma forma. Si cambias mucho, sube también el número de `CACHE` en `sw.js` (por ejemplo `gymfit-v2`) para que el iPhone descargue la versión nueva.

## 5. Instalarla en el iPhone

1. Abre tu dirección `https://TU-USUARIO.github.io/gymfit/` en **Safari**.
2. Pulsa **Compartir** → **Añadir a pantalla de inicio** → **Añadir**.
3. Abre GymFit desde el icono. Funciona a pantalla completa, como una app normal.

## 6. Activar el análisis de fotos con IA (gratis)

Por defecto la app usa **Google Gemini**, que tiene un nivel gratuito sin tarjeta:

1. Entra en [aistudio.google.com](https://aistudio.google.com) con tu cuenta de Google.
2. Pulsa **Get API key → Create API key** y copia la clave (empieza por `AIza...`).
3. En GymFit: **Ajustes → Inteligencia artificial → Gemini · gratis**, pega la clave y pulsa **Probar conexión**.

Sobre el nivel gratuito:

- Tiene un límite de peticiones por minuto y por día. Google no garantiza cifras fijas (las ves en AI Studio), pero para unas cuantas fotos al día sobra.
- Si llegas al límite, la app te avisa y puedes esperar o introducir la comida a mano.
- Google puede usar lo que envías en el nivel gratuito para mejorar sus productos. Si no te importa que vean fotos de tus platos, no hay problema.
- Si algún día el modelo `gemini-flash-latest` da error, cambia el nombre del modelo en Ajustes por el que aparezca en AI Studio.

¿Prefieres Claude? Elige **Claude · de pago** en Ajustes y pega una clave de [console.anthropic.com](https://console.anthropic.com) (cada foto cuesta céntimos).

La clave se guarda solo en tu iPhone. Las estimaciones por foto son aproximadas: revisa los gramos antes de guardar (al cambiarlos, calorías y macros se recalculan solos).

## 7. Traer las pesadas de la báscula (Mi Body Composition Scale 2)

Safari no deja a las webs usar Bluetooth y Xiaomi no tiene una API pública, así que GymFit no puede leer la báscula directamente. Los datos llegan por Zepp Life de dos formas (**Nutrición → Peso → Importar de la báscula**):

**A) Desde Apple Salud con un Atajo (para el día a día)**

1. En Zepp Life conecta Apple Salud (Perfil → Añadir cuentas → Apple Salud) y permite escribir Peso y Grasa corporal.
2. En la app **Atajos** crea uno nuevo con:
   - *Buscar muestras de salud*: tipo **Peso**, ordenar por **Fecha de inicio**, **Más reciente primero**, límite 90.
   - *Repetir con cada* → dentro un *Texto*: `Fecha de inicio` (formato ISO 8601) `;` `Valor` del elemento de repetición.
   - Tras *Fin de repetición*: *Copiar al portapapeles*.
3. Ejecuta el Atajo, abre GymFit y pulsa **Pegar del portapapeles**. Se enseña un resumen antes de guardar y las pesadas repetidas no se duplican.

Opcional: duplica las acciones con tipo *Porcentaje de grasa corporal* y pon `grasa;` al principio del Texto.

**B) Archivo CSV de Zepp Life (todo el historial)**

Usa *Exportar datos* en Zepp Life (dentro de Perfil → Ajustes; el sitio cambia según la versión). Descomprime el ZIP en Archivos y elige el `BODY_….csv` de la carpeta `BODY`: trae peso y toda la composición corporal.

También puedes apuntar el peso a mano con el botón **+**. El peso objetivo y la altura (para el IMC) se cambian en **Ajustes → Peso**. Se guarda una pesada por día; si hay varias, gana la última.

---

## Estructura del proyecto

```
gymfit/
├── index.html          Página principal y barra de pestañas
├── manifest.json       Datos de la app instalable (nombre, iconos, colores)
├── sw.js               Funcionamiento sin conexión
├── serve.py            Servidor local para probar (Python)
├── css/styles.css      Todo el diseño (colores en :root, arriba del archivo)
├── icons/              Iconos de la app
├── tools/make_icons.py Regenera los iconos (Python + Pillow)
└── js/
    ├── app.js          Arranque y navegación entre pestañas
    ├── utils.js        Grupos musculares, fechas, ajustes, rachas
    ├── db.js           Base de datos local (IndexedDB)
    ├── calendar.js     Pestaña Calendario
    ├── routines.js     Pestaña Rutinas (tus rutinas y biblioteca de ejercicios)
    ├── exercises.js    Lista de ejercicios, plantillas de rutinas
    ├── bodymap.js      Dibujo del cuerpo con los músculos (SVG)
    ├── workout.js      Modo entrenar e historial de pesos
    ├── stats.js        Pestaña Estadísticas
    ├── nutrition.js    Pestaña Nutrición y flujo de fotos
    ├── weight.js       Control de peso e importación de la báscula
    ├── api.js          Llamada a la IA de Claude (prompt del análisis)
    ├── settings.js     Pestaña Ajustes y copias de seguridad
    ├── charts.js       Gráficas en SVG
    └── sheet.js        Hojas inferiores deslizables
```

## Personalizar

| Quiero… | Dónde |
| --- | --- |
| Cambiar el color principal | `css/styles.css` → `--accent` |
| Añadir o quitar grupos musculares | `js/utils.js` → `MUSCLES` |
| Cambiar cuándo avisa de músculos olvidados | `js/utils.js` → `NEGLECT_DAYS` |
| Añadir ejercicios o cambiar sus músculos | `js/exercises.js` → `EXERCISES` |
| Cambiar las plantillas de rutinas | `js/exercises.js` → `TEMPLATES` |
| Cambiar cómo analiza la IA las fotos | `js/api.js` → `SYSTEM_PROMPT` |
| Cambiar los tipos de comida | `js/nutrition.js` → `MEAL_TYPES` |
| Cambiar los datos de composición que se muestran | `js/weight.js` → `METRICS` |
| Otro icono | `tools/make_icons.py` (cambia colores) y ejecuta `python tools/make_icons.py` |

## Notas sobre voz y código de barras

- **Voz:** el botón "Toca para dictar" usa el reconocimiento de voz de Safari. Si en tu iPhone no responde (a veces pasa con la app instalada en la pantalla de inicio), usa el micrófono 🎙️ del teclado, que siempre funciona.
- **Escáner con cámara en vivo:** necesita que la app esté publicada con `https` (GitHub Pages). Probando con `python serve.py` desde el iPhone puedes usar "Hacer foto del código" o escribir el número.
- La primera vez que abras el escáner se descarga el lector (unos 400 KB) y queda guardado para usarlo sin conexión. Buscar el producto sí necesita internet.
- Si un producto no está en Open Food Facts, puedes añadirlo tú en su web o app: es una base de datos colaborativa.

## Sobre Python

El iPhone no ejecuta Python, así que la app que ves está en HTML, CSS y JavaScript (sin instalar nada: los archivos se editan tal cual). Python se usa para el servidor de pruebas (`serve.py`) y para generar los iconos. El JavaScript está comentado en español y se parece bastante a Python: `const x = 5` es `x = 5`, `for (const w of lista)` es `for w in lista:`, y las funciones se definen con `function nombre() { ... }`.

## Copias de seguridad

Los datos viven en Safari del iPhone. En **Ajustes → Exportar copia de seguridad** se genera un archivo `.json` que puedes guardar en Archivos o iCloud. Para restaurar: **Importar copia de seguridad**.
