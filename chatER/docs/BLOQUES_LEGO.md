# Bloques LEGO de ChatER

Los bloques LEGO son funcionalidades completas ubicadas en la raíz del proyecto. Cada bloque mantiene dos zonas estrictas:

- `BLOQUE/`: contiene el código pesado, algoritmos, validaciones internas y compatibilidad de navegador.
- `conexion/`: contiene solo el puente mínimo que usa el resto de la app. Ningún módulo externo debe importar directamente código pesado si ya existe una conexión pública.

Esta separación evita repetir lógica, reduce regresiones y permite que una IA modifique una funcionalidad aislada sin tocar pantallas o flujos que no están relacionados.

## IMAGENwebpCOMPRESIONx

Ruta principal: `IMAGENwebpCOMPRESIONx/`

- `BLOQUE/compresor-webp-core.js`: comprime imágenes a WebP, verifica cabecera real `RIFF....WEBP`, busca equilibrio entre dimensión/calidad y rechaza salidas que no puedan cumplir el límite configurado.
- `conexion/imagen-webp-compresionx.js`: expone `ChatERImageWebpCompressorLego` como puente único para `js/app.js`.

Regla de uso: cualquier imagen de chat debe pasar por este bloque antes de intentar subirla. La app debe validar con `assertReadyForUpload()` justo antes de crear una intención de `imagenes-r2x` o una carga de respaldo `media-firmada`. El límite máximo de imagen de chat es 200 KB; puede quedar por debajo, pero nunca por encima.

Punto débil corregido: la compresión no debe depender solo de que el candidato visual quepa; el bloque ahora emite `guarantee` con `validator`, versión de esquema, firma `RIFF_WEBP`, `headroomBytes`, calidad, dimensiones, modo de compresión, `auditId`, `acceptedReason` y `assertedAt`. `js/app.js` guarda esa garantía en `message.imageCompression` para auditar reintentos y evitar que una ruta secundaria suba una imagen sin evidencia de límite estricto.

Refuerzo de esta iteración: el candidato aceptable ya no puede reemplazar a ciegas al mejor candidato visual encontrado antes de cortar la búsqueda. Si aparece un candidato válido que permite terminar por rendimiento, el bloque conserva el mejor candidato previo cuando tiene mejor equilibrio visual y solo usa el candidato nuevo si realmente mejora la salida. Esto mantiene el límite máximo de 200 KB sin degradación innecesaria.

Refuerzo adicional `webp-200kb-v3`: el punto débil restante era tratar el margen blando interno como si fuera el único candidato válido. Ahora el bloque también conserva el mejor candidato que cumple el límite duro real de 200 KB aunque quede entre el margen blando y el máximo exacto. La validación final sigue rechazando cualquier byte por encima de 200 KB, pero evita bajar calidad o dimensión solo para ganar un margen que no es parte del requisito funcional. La garantía auditable incluye `acceptedLimit` y `targetHeadroomMet` para distinguir cuándo la salida cumplió el margen blando o cuándo se usó el límite duro de forma segura.

Refuerzo adicional `webp-200kb-v4`: el punto débil identificado en esta iteración era que la selección del candidato podía comparar dimensión y calidad de forma demasiado lineal. En imágenes grandes, eso podía favorecer una salida con muchos píxeles pero calidad baja frente a una salida un poco más pequeña y visualmente más limpia. `IMAGENwebpCOMPRESIONx` ahora usa una puntuación perceptual con penalización fuerte por calidad baja, registra `qualityBand` y `perceptualScore`, y solo permite cortes tempranos cuando la calidad está en una banda segura. La garantía de 200 KB sigue siendo estricta: cualquier candidato final pasa por `assertReadyForUpload()` y por verificación RIFF/WEBP antes de que la app cree intención R2x o carga de respaldo.

Refuerzo adicional `webp-200kb-v5`: el punto débil identificado ahora era la aceptación temprana del primer candidato válido. Aunque cumplía el límite de 200 KB, podía impedir comparar dimensiones inmediatamente inferiores que conservan mejor nitidez con una calidad WebP más alta. El bloque mantiene una ventana acotada de lookahead tras el primer candidato aceptable, conserva el mejor candidato perceptual bajo el límite duro y registra `acceptedLookahead`, `acceptedLookaheadCount`, `bestCandidatePerceptualScore` y `finalSelectionReason`. Así se mantiene rendimiento, pero el upload sigue bloqueado si la salida final no es WebP real o supera 200 KB.

## QRcodigosX

Ruta principal: `QRcodigosX/`

- `BLOQUE/qr-core.js`: genera, renderiza y lee el payload QR compacto del perfil.
- `conexion/qr-codigosx.js`: expone el puente `ChatERQRCodeLego` para la interfaz.

Regla de uso: el avatar personal debe mostrar el QR del perfil y el flujo de Crear contacto debe resolver el QR desde este bloque. Si el contacto ya existe se abre el chat; si no existe, se crea y se abre.

## PERMISOSx

Ruta principal: `PERMISOSx/`

- `BLOQUE/permisos-core.js`: muestra la interfaz de permiso, consulta estado cuando el navegador lo permite y guía a configuración si fue denegado.
- `conexion/permisosx.js`: expone el puente `ChatERPermisosLego` para botones de cámara, micrófono, archivos, notificaciones y otras capacidades.

Regla de uso: ningún botón asociado a permisos debe ejecutar cámara, micrófono, archivos o notificaciones sin pasar primero por este bloque.

## Archivos heredados marcados para eliminación

Si en una iteración aparecen archivos standalone que dupliquen funcionalidades de los bloques LEGO raíz, deben agregarse a `NOVAelimina.txt` y deben ignorarse en análisis funcional mientras Nova los elimina. En este ZIP no quedan copias standalone activas de `js/image-webp-compressor-lego.js` ni `js/qr-code-lego.js`.

## Refuerzo de esta iteración: permisos combinados, QR por imagen y vista previa multimedia

Punto débil corregido en `PERMISOSx`: la capacidad `camera-microphone` ya no consulta solo el estado de cámara. El bloque consulta cámara y micrófono como permisos separados, fusiona estados y solo informa `granted` cuando ambos están concedidos; si cualquiera está denegado, muestra guía manual antes de ejecutar el flujo asociado.

Punto débil corregido en `QRcodigosX`: el escaneo de contacto ya no depende únicamente de cámara activa. El bloque agrega `scanFromImage()` para leer una imagen del QR con el mismo contrato de payload, y la interfaz de Crear contacto permite seleccionar una imagen del QR cuando la cámara está bloqueada o no puede iniciar.

Punto débil corregido en lista de chats: los mensajes de imagen, audio, video o archivo sin texto ahora muestran una vista previa de producción (`Imagen`, `Audio`, `Video` o `Archivo`) en la lista principal, archivados y detalles, evitando filas vacías cuando el último mensaje es un adjunto.


## Refuerzo de listas con scroll auditables

Punto débil corregido en esta iteración: algunas listas dinámicas dependían solo de clases CSS y podían quedar fuera de las reglas genéricas si una IA creaba una lista nueva dentro de un modal o panel. `js/app.js` agrega `applyListScrollSemantics()` y marca contenedores de listas conocidos con `data-list-scroll` cada vez que se renderiza una sección, modal o panel de emojis. Las listas principales (`chat-list`, `messages`, `status-panel`) conservan su altura flex natural y las listas internas de modales reciben scroll propio para que ningún ítem quede inaccesible cuando haya muchos elementos.


## Refuerzo adicional `webp-200kb-v6`: lookahead sensible a la política efectiva

Punto débil corregido en esta iteración: el lookahead posterior al primer candidato aceptable ya protegía el máximo global de 200 KB, pero su decisión de continuidad todavía miraba el límite global del bloque. Si `memoriaBACKEND` entrega una política menor para una cuenta, sala o entorno específico, la selección debe razonar con ese límite efectivo desde el primer checkpoint, no solo en la validación final.

`IMAGENwebpCOMPRESIONx` ahora calcula la ventana acotada de comparación con `maxBytes` normalizado, registra `effectiveMaxBytes` en diagnósticos y conserva la validación final `RIFF/WEBP + size <= política efectiva`. Esto evita aceptar o auditar candidatos con una métrica más permisiva que la política real del backend, sin duplicar procesos locales ni crear APIs para compresión.

## Refuerzo adicional `webp-200kb-v7`: evidencia final del archivo realmente subido

Punto débil corregido en esta iteración: `js/app.js` ya comprimía la imagen antes de enviarla, pero si después una política específica de `imagenes-r2x` o el respaldo `MEDIAfirmadaX` volvía a transformar el archivo, el mensaje podía conservar una evidencia `imageCompression` perteneciente a una versión anterior del archivo. Eso no rompía el límite de bytes, pero dejaba una auditoría débil porque la metadata del mensaje no siempre describía el WebP final realmente subido o encolado.

Ahora cada ruta de envío y reintento actualiza `imageCompression` después de la última preparación efectiva del archivo, vuelve a pasar por `assertReadyForUpload()` antes de crear el payload y adjunta esa evidencia en `buildMediaMessagePayload()`. La compuerta sigue siendo local y no crea una API nueva: memoriaBACKEND solo recibe la metadata útil para auditoría del mensaje, mientras la compresión continúa dentro del bloque LEGO raíz.

## Refuerzo adicional `webp-200kb-v8`: compuerta visual mínima antes del upload

Punto débil corregido en esta iteración: el bloque ya garantizaba WebP real y peso máximo estricto, pero en imágenes extremas todavía podía existir un candidato técnicamente válido por bytes con una banda visual demasiado degradada. Eso cumplía los 200 KB, pero no protegía suficientemente la regla de no perder calidad notable.

`IMAGENwebpCOMPRESIONx` ahora separa candidatos válidos por peso de candidatos visualmente aceptables. Solo puede seleccionar como salida final una imagen con calidad mínima segura y lado largo suficiente para el tamaño original; los candidatos que caben en 200 KB pero caen por debajo de esa compuerta quedan auditados como rechazados y no se suben automáticamente. La garantía sigue usando `assertReadyForUpload()` para `RIFF/WEBP + size <= política efectiva`, pero añade `finalVisualGate`, `visualQualityFloor`, `visualMinLongSide` y `finalRejectionReason` en diagnósticos cuando no se puede cumplir peso y calidad al mismo tiempo.

## Refuerzo adicional `webp-200kb-v9`: respaldo Canvas con la misma compuerta visual

Punto débil corregido en esta iteración: cuando el BLOQUE principal de `IMAGENwebpCOMPRESIONx` fallaba por compatibilidad del navegador y `js/app.js` usaba el respaldo Canvas defensivo, esa ruta secundaria seguía validando `RIFF/WEBP + <= 200 KB`, pero no aplicaba explícitamente la misma compuerta visual mínima de calidad/dimensión antes del upload. Eso podía permitir una salida técnicamente válida por peso con degradación mayor a la aceptable si el navegador no podía ejecutar el bloque principal.

Ahora el respaldo Canvas de `js/app.js` calcula `finalVisualGate`, `qualityBand`, `visualQualityFloor` y `visualMinLongSide` antes de aceptar el WebP. Si el candidato cumple bytes pero no supera la compuerta visual, la búsqueda continúa con una combinación más segura de dimensión/calidad o rechaza el envío automático con error claro. La compresión sigue siendo local; no se crea API nueva porque memoriaBACKEND solo recibe el WebP final y la evidencia auditable cuando ya cumple la política estricta.

## Refuerzo adicional `webp-200kb-v10`: selección visual por dimensión antes del margen blando

Punto débil corregido en esta iteración: dentro de una misma dimensión el bloque podía encontrar una salida que cumplía el margen blando interno y devolverla de inmediato, aunque también existiera una variante con mayor calidad que seguía por debajo del máximo efectivo de 200 KB. Eso garantizaba el peso, pero podía sacrificar calidad sin necesidad.

`IMAGENwebpCOMPRESIONx` ahora expone al selector global el mejor candidato seguro de cada dimensión, no solo el primero que cumple el margen blando. Si la salida de mejor calidad queda entre el margen blando y el límite duro, se marca como `acceptedLimit: hard-max-200kb`, mantiene `targetHeadroomMet: false` y vuelve a pasar por `assertReadyForUpload()` antes del upload. Así el límite máximo sigue siendo estricto, pero el compresor evita pérdida visual innecesaria cuando todavía hay bytes disponibles dentro de la política real.

## Refuerzo adicional `webp-200kb-v11`: redimensionado multipaso para imágenes grandes

Punto débil corregido en esta iteración: el bloque ya garantizaba WebP real, límite efectivo máximo de 200 KB y compuerta visual mínima, pero las imágenes grandes podían reducirse en un solo `drawImage()` de Canvas. Ese downscale único puede provocar suavizado excesivo o pérdida perceptible de detalle aunque el archivo final cumpla bytes, calidad nominal y dimensiones mínimas.

`IMAGENwebpCOMPRESIONx` ahora usa redimensionado progresivo multipaso antes de codificar cada candidato WebP. Cuando la imagen original es mucho mayor que el tamaño objetivo, el bloque crea etapas intermedias con `imageSmoothingQuality = high` hasta llegar al tamaño final. El respaldo defensivo de `js/app.js` usa la misma estrategia para no abrir una ruta secundaria con peor calidad. La garantía final sigue siendo estricta: se verifica firma `RIFF/WEBP`, peso `<= 200 KB`, compuerta visual y metadata auditable antes de cualquier intención `imagenes-r2x` o respaldo `MEDIAfirmadaX`.


## Refuerzo adicional `webp-200kb-v12`: margen seguro cuando la calidad es equivalente

Punto débil corregido en esta iteración: el bloque ya podía seleccionar el mejor candidato visual bajo el máximo estricto de 200 KB, pero cuando dos salidas eran prácticamente equivalentes para el usuario, todavía podía preferir una salida más pesada solo por una mejora perceptual mínima. Eso no rompía el límite, pero dejaba menos holgura para políticas efectivas menores de `memoriaBACKEND` o para auditoría de reintentos.

`IMAGENwebpCOMPRESIONx` ahora detecta candidatos visualmente equivalentes y, en ese caso, prioriza el que cumple el margen blando interno (`target-headroom`) o deja más bytes libres sin pérdida notable. La validación final no cambia: antes de cualquier envío se verifica formato WebP real con firma `RIFF/WEBP` y peso `<= 200 KB` o `<= maxBytes` efectivo si el backend entrega una política menor.

## 129. Revisión de punto débil: `Escribiendo...` remoto podía quedar obsoleto si se perdía `typing.stop`

En esta iteración se identificó que el flujo de escritura remota ya aplicaba una gracia de 2 segundos al recibir `typing.stop`, pero dependía demasiado de que ese evento llegara siempre desde STREMEx o desde la API efímera. Si el navegador, la red o el backend perdían el cierre, el texto `Escribiendo...` podía permanecer visible aunque la otra parte ya no estuviera escribiendo.

Cambios aplicados:

- `js/app.js` añade `REMOTE_TYPING_STALE_MS` como expiración defensiva para señales remotas de escritura.
- Cada `typing.start` remoto reinicia el temporizador obsoleto, conserva el estado previo y mantiene `Escribiendo...` solo mientras existe actividad reciente.
- Cada `typing.stop` remoto cancela la expiración larga y conserva la gracia exacta de 2 segundos para evitar parpadeos si la otra parte pausa y vuelve a escribir rápidamente; un `typing.stop` aislado sin señal previa se ignora para no crear un falso estado de escritura.
- Los cambios de presencia recibidos mientras el contacto escribe actualizan el estado previo, pero no pisan visualmente ni persisten `Escribiendo...`; al terminar la escritura se restaura el estado más reciente.
- La limpieza de sesión y de estados remotos cancela tanto temporizadores de gracia como temporizadores obsoletos para evitar callbacks tardíos.

Validación ejecutada:

- `node --check js/app.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json` validado como JSON correcto.

Alcance preservado:

- No se modifica el contrato de STREMEx ni se crea una API local nueva. El cambio es defensivo del frontend sobre una señal efímera ya existente.
- Se preservan contactos, QR, permisos, instalación PWA, compresión WebP, mensajes, listas con scroll y rutas existentes de memoriaBACKEND.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir la frase final.

## Refuerzo IMAGENwebpCOMPRESIONx v14 - dimensión inviable sin bloqueo

Punto débil identificado: el bloque ya garantizaba WebP real dentro del límite efectivo, pero en imágenes muy grandes o con mucho ruido podía invertir intentos de codificación en una dimensión que seguía muy por encima de 200 KB aun cerca del piso de calidad. Ese caso no mejora el resultado visual y sí puede retrasar la UI antes de enviar el adjunto.

Mejora aplicada: `IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js` ahora corta la búsqueda interna de calidad de una dimensión cuando no existe candidato seguro y el tamaño resultante sigue ampliamente por encima del límite cerca del piso de calidad. Luego continúa con una dimensión menor, que suele preservar mejor nitidez dentro de 200 KB que seguir bajando calidad en una dimensión inviable.

Garantía preservada: el bloque no acepta ni sube ninguna imagen que supere el límite efectivo; la validación final sigue centralizada en `assertReadyForUpload()` antes de llamar a `memoriaBACKEND/imagenesR2`. Este refuerzo es local del frontend y no debe convertirse en API backend.

## Refuerzo scroll de listas v14

Punto débil identificado: el menú flotante real del chat usa `.chat-floating-menu-list`, pero la auditoría semántica de listas del frontend solo cubría el nombre legado `.chat-floating-menu-options`. La hoja de estilos ya tenía scroll, pero el puente de semántica podía no marcar ese contenedor.

Mejora aplicada: `js/app.js` conserva el selector legado y agrega explícitamente `.chat-floating-menu-list` para que el menú flotante también reciba `data-list-scroll`, `tabindex` y comportamiento consistente con el resto de listas.


## Refuerzo IMAGENwebpCOMPRESIONx v15 - desempate con política efectiva real

Punto débil identificado: el bloque de compresión ya respetaba el límite efectivo al validar y al cortar candidatos, pero el desempate entre candidatos visualmente equivalentes todavía calculaba la holgura con el máximo global cuando el `planItem` no llevaba `maxBytes`. Si memoriaBACKEND devolvía una política menor a 200 KB, esa comparación podía preferir un candidato más pesado usando una referencia de holgura incorrecta, aunque la validación final impidiera subir archivos fuera del límite.

Mejora aplicada: `IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js` ahora inyecta `maxBytes` y `targetBytes` efectivos en cada item del plan de dimensiones antes de evaluar candidatos. `isBetterCandidate()` usa ese límite real para comparar margen, calidad y bytes libres entre opciones equivalentes. Así el bloque conserva calidad cuando se nota, pero si dos opciones son equivalentes prioriza la que deja holgura real bajo la política efectiva de `memoriaBACKEND` o los 200 KB máximos del producto.

Garantía preservada: la compresión sigue siendo un proceso local del frontend. No se crea API backend para comprimir, decidir calidad ni generar WebP. Antes de cualquier subida se mantiene la compuerta `RIFF/WEBP + size <= maxBytes efectivo` y la evidencia auditable de `imageCompression` sigue describiendo el archivo final.

## Refuerzo scroll de listas v15 - grids usados como listas navegables

Punto débil identificado: varias superficies visuales funcionan como listas aunque su clase termine en `-grid` o no contenga literalmente `list`, por ejemplo menús de sección, acciones rápidas, estado de APIs, llamadas y métricas. La UI ya tenía scroll en listas principales, pero esos contenedores podían crecer demasiado en pantallas pequeñas o cuando hubiera muchos ítems.

Mejora aplicada: `js/app.js` agrega esos contenedores al puente `SCROLLABLE_LIST_SELECTOR` para recibir semántica de scroll y foco; `css/styles.css` añade `max-height`, `overflow-y: auto`, `overscroll-behavior` y scroll táctil a esos grids/listas sin cambiar su contenido ni su lógica.

## Refuerzo IMAGENwebpCOMPRESIONx v16 - una sola política efectiva y auditoría preservada

Punto débil identificado: la app comprimía la imagen localmente antes de conocer la política efectiva de `imagenes-r2x` y luego podía pasar por una segunda preparación para backend. Cuando esa segunda preparación solo reutilizaba el WebP ya válido, la metadata podía sobrescribirse como `quality: 1` y `original-webp-within-limit`, perdiendo la calidad/dimensión original que realmente había producido el bloque.

Mejora aplicada: `js/app.js` consulta la política efectiva de imagen de chat antes de la compresión inicial cuando memoriaBACKEND está disponible, usa fallback local estricto de 200 KB si la política no está disponible, y conserva la auditoría `imageCompression` original cuando R2/MEDIAfirmada solo reutiliza un WebP ya validado. Además, `canvasToWebpBlob()` en el bloque y en el respaldo defensivo ahora captura excepciones síncronas y timeout de codificación para no dejar un adjunto colgado ni enviarlo sin garantía.

Garantía preservada: ninguna ruta sube imágenes por encima del límite efectivo. La salida final conserva la verificación `RIFF/WEBP`, `size <= maxBytes`, `headroomBytes`, dimensiones, calidad real, archivo original y evidencia de si el WebP fue reutilizado sin recomprimir.


## Refuerzo IMAGENwebpCOMPRESIONx v17 - auditoría preservada cuando el WebP conserva el mismo nombre

Punto débil identificado: el flujo de adjuntos ya comprimía localmente, validaba `RIFF/WEBP` y garantizaba `<= 200 KB` antes de llamar a `memoriaBACKEND/imagenesR2`. Sin embargo, la preservación de auditoría al reutilizar un WebP ya validado dependía de que el nombre del archivo comprimido fuera distinto al nombre original. Si el usuario adjuntaba un `.webp` que necesitaba recomprimirse y el resultado conservaba el mismo nombre, una segunda preparación de subida podía registrar el archivo como `original-webp-within-limit` y sobrescribir datos reales de la compresión previa, como calidad, dimensiones originales o número de intentos.

Mejora aplicada: `js/app.js` ahora reconoce como misma fuente auditable el WebP reutilizado por identidad del archivo original y, como respaldo, por identidad del archivo preparado. La condición ya no exige que el nombre final sea diferente. Cuando `memoriaBACKEND/R2` reutiliza el WebP ya validado, `imageCompression` conserva la auditoría de la primera compresión y registra `uploadPreparation.reusedCompressedWebp` sin falsear `quality=1`, dimensiones originales ni diagnóstico visual.

Garantía preservada: el bloque `IMAGENwebpCOMPRESIONx` sigue siendo local y no se convierte en API. La subida a `imagenesR2` o `MEDIAfirmadaX` recibe únicamente el WebP final ya validado bajo el máximo efectivo, con metadata auditable estable aunque el archivo original y el archivo final compartan nombre.

## Refuerzo IMAGENwebpCOMPRESIONx v18 - empates visuales sin desperdiciar bytes

Punto débil identificado: el bloque ya garantizaba WebP real, `<= 200 KB` o `<= maxBytes` efectivo y compuerta visual mínima, pero en empates exactos de calidad/dimensión podía conservar el candidato más pesado aunque no ofreciera una mejora perceptual. Eso no rompía el límite, pero reducía holgura para políticas efectivas menores, reintentos y auditoría.

Mejora aplicada: `IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js` ahora prefiere el WebP más liviano cuando dos candidatos tienen calidad, dimensión y score perceptual equivalentes. La misma regla se aplica dentro de una dimensión cuando la calidad es idéntica. No se baja calidad para ahorrar bytes; solo se evita elegir una salida más pesada cuando no existe ganancia visual.

Garantía preservada: la compresión sigue siendo proceso local del frontend. La salida final mantiene verificación `RIFF/WEBP`, peso máximo efectivo, compuerta visual, auditoría de calidad/dimensión y subida posterior por `imagenesR2`/`MEDIAfirmadaX` únicamente con el archivo ya validado.

## Refuerzo PERMISOSx v18 - permisos denegados con guía manual inmediata

Punto débil identificado: cuando el navegador ya había marcado cámara, micrófono o notificaciones como `denied`, la ventana de permisos informaba el bloqueo, pero el botón principal podía intentar nuevamente una solicitud que el navegador normalmente no volvería a mostrar. Eso generaba una experiencia confusa al presionar botones asociados a permisos.

Mejora aplicada: `PERMISOSx/BLOQUE/permisos-core.js` cambia la acción principal a `Ver instrucciones para activar` cuando detecta un permiso denegado o cuando la solicitud falla por bloqueo. En ese estado no intenta saltarse permisos del navegador; muestra instrucciones para abrir la configuración del sitio y deja la acción bloqueada hasta que el usuario lo active manualmente.

Garantía preservada: no se crea API backend para permisos locales. La ventana sigue siendo un bloque LEGO local; solo la auditoría multi-dispositivo, si se requiere, corresponde al concepto `PERMISOSnavegadorX` ya descrito en `APIs necesarias.txt`.



## Refuerzo APIs necesarias y PERMISOSx v19 - separación backend/local y recuperación manual

Punto débil identificado: `APIs necesarias.txt` todavía listaba como conceptos pendientes varias capacidades que ya están publicadas en `APIS de memoriaBACKEND/apis v483.txt`. Eso podía inducir a crear APIs duplicadas para accesos directos, acciones de chat, QR de contacto, permisos e instalación PWA, aunque la regla del proyecto exige que ese archivo solo contenga conceptos que memoriaBACKEND no soporte.

Mejora aplicada: `APIs necesarias.txt` queda actualizado sin contratos pendientes para esta iteración y documenta explícitamente qué capacidades ya están cubiertas por memoriaBACKEND. Los procesos locales, como compresión WebP, QR visual, permisos del navegador, scroll de listas, UI PWA y gracia de `Escribiendo...`, permanecen fuera de ese archivo como comportamiento del frontend.

Punto débil adicional identificado: cuando un permiso ya estaba denegado, `PERMISOSx` mostraba instrucciones manuales, pero no ofrecía un camino claro para comprobar el permiso después de que el usuario lo activara en configuración. El usuario podía quedar obligado a cerrar y repetir la acción asociada.

Mejora aplicada: `PERMISOSx/BLOQUE/permisos-core.js` mantiene la guía manual sin intentar saltarse permisos del navegador y cambia la acción principal a `Continuar después de activar`. Al pulsarla, el bloque vuelve a comprobar/solicitar el permiso con el flujo normal del navegador. Si sigue bloqueado, vuelve a mostrar la guía; si ya está activo, entrega el resultado a la acción original.

Garantía preservada: no se crea API backend para procesos locales. La auditoría remota de permisos, instalación, contactos, mensajes o imágenes sigue usando únicamente las APIs existentes de memoriaBACKEND cuando están disponibles.

## Refuerzo IMAGENwebpCOMPRESIONx v20 - dimensión máxima local acotada

Punto débil identificado: el bloque ya garantizaba `RIFF/WEBP` y `<= 200 KB`, pero todavía aceptaba una `maxDimension` externa sin techo local explícito antes de construir el plan de canvas. Si una política remota o una llamada interna entregaba una dimensión excesiva, el navegador podía intentar preparar canvases innecesariamente grandes, degradando memoria, tiempo de compresión y estabilidad de la UI sin mejorar el resultado final de un archivo limitado a 200 KB.

Mejora aplicada: `IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js` incorpora `MAX_DIMENSION_LIMIT = 4096` y `clampMaxDimension()`. `js/app.js` normaliza la dimensión efectiva de imagen de chat con el mismo techo antes de invocar el bloque LEGO o el respaldo local. La conexión pública expone el clamp para que cualquier integración futura use el mismo contrato y no repita lógica.

Garantía preservada: la compresión sigue siendo un proceso local del frontend. No se crea API para comprimir imágenes. La validación final mantiene WebP real, tamaño máximo efectivo y evidencia auditable antes de enviar por `memoriaBACKEND/imagenesR2` o respaldo de media firmada.

## Refuerzo scroll de listas v20 - semántica dinámica completa

Punto débil identificado: varias listas ya tenían scroll por CSS, pero el selector central de auditoría semántica no marcaba algunos contenedores dinámicos como acciones de sección, accesos de llamada, resultados de búsqueda y listas declaradas con `role=list` o `role=listbox`. Eso podía dejar superficies largas sin `data-list-scroll`, foco navegable o etiqueta accesible uniforme.

Mejora aplicada: `js/app.js` amplía `SCROLLABLE_LIST_SELECTOR` para cubrir esos contenedores y agrega etiquetas `aria-label` seguras para listas dinámicas. La app mantiene el scroll existente y ahora también marca de forma consistente las listas creadas dentro de modales o paneles sin cambiar la lógica de renderizado.

Garantía preservada: no se crea API para procesos locales de UI. El scroll de listas, foco navegable y accesibilidad permanecen como comportamiento del frontend, mientras las APIs de memoriaBACKEND quedan reservadas para sincronización, almacenamiento, verificación o interacción entre usuarios.

## Refuerzo IMAGENwebpCOMPRESIONx v21 - reutilización segura del WebP ya validado

Punto débil identificado: el flujo de adjuntos ya comprimía la imagen al inicio y garantizaba `RIFF/WEBP` con peso `<= 200 KB` o `<= maxBytes` efectivo, pero al entrar a `imagenes-r2x` o al respaldo `MEDIAfirmadaX` podía volver a llamar al compresor sobre el mismo WebP. Esa segunda pasada normalmente no mejoraba calidad ni seguridad, y sí podía duplicar trabajo de canvas, reiniciar el tramo visual de progreso y consumir más CPU/memoria en móviles.

Mejora aplicada: `IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js` expone `reusePreparedWebp()`. Esta ruta no recomprime: verifica otra vez cabecera `RIFF/WEBP`, bytes finales contra la política efectiva y recalcula una garantía auditable para el upload actual. `js/app.js` conserva el resultado de la primera compresión y lo entrega a `prepareR2xTemporaryImageForBackend()` o al fallback `MEDIAfirmadaX`; si la política efectiva es más estricta y el archivo ya no cabe, entonces sí vuelve al compresor normal.

Garantía preservada: no se crea API backend para compresión. La optimización solo evita trabajo local duplicado cuando el archivo final ya es WebP real y cumple el límite efectivo. Antes de cualquier subida siguen activos `assertReadyForUpload()`, `headroomBytes`, `maxBytes`, `validator`, `quality`, dimensiones, `sha256` y `imageCompression` del mensaje.


## Refuerzo IMAGENwebpCOMPRESIONx v22 - compuerta visual limitada por maxDimension efectivo

Punto débil identificado: el bloque WebP ya validaba `RIFF/WEBP`, peso máximo efectivo y calidad mínima, pero la compuerta de dimensión visual calculaba el mínimo aceptable solo con el tamaño original. En imágenes extremadamente grandes, ese mínimo podía quedar por encima del `maxDimension` real permitido por la política local o por `memoriaBACKEND`; el resultado era un rechazo innecesario aunque el candidato final estuviera en la máxima dimensión permitida, con buena calidad y dentro de 200 KB.

Mejora aplicada: `IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js` ahora evalúa `getMinimumAcceptableLongSide()` con el `maxDimension` efectivo y agrega `policyLongSideCap` a la auditoría de la compuerta visual. El respaldo Canvas de `js/app.js` aplica la misma regla para no abrir una ruta secundaria más estricta que el bloque LEGO. La compuerta no relaja bytes ni formato: solo evita exigir una dimensión mayor a la política de imagen vigente.

Garantía preservada: la compresión continúa siendo local, sin API nueva. Antes de subir por `imagenesR2` o `MEDIAfirmadaX` se mantiene WebP real, `size <= maxBytes`, calidad mínima, redimensionado multipaso, auditoría de dimensiones y trazabilidad de la política efectiva.
