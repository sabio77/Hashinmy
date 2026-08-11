# Changelog

## 1.9.92 - 2026-08-10

- Reforzada la continuidad del stream SSE en PWA móviles: la apertura HTTP nativa del `EventSource` cuenta ahora como actividad de transporte, evitando reciclar una conexión válida solo porque `p2p_ready` se retrase detrás del proxy o del backend.
- Al volver de `pageshow` o de segundo plano, la pestaña líder revalida sin polling el liveness del stream y recicla conexiones `OPEN` silenciosas o `CONNECTING` vencidas; `openRealtime()` tampoco reutiliza una fuente zombie durante una recuperación `online`.
- El timeout de apertura conserva su instante original al rearmarse tras una suspensión, por lo que un temporizador congelado no concede otros 20 segundos completos a una conexión ya vencida. Se ampliaron las regresiones SSE sin modificar el contrato de memoriaBACKEND ni la sincronización local opcional.

## 1.9.90 - 2026-08-04

- La coordinación `P2P_sin_` de papelera y purga conserva ahora un comprobante durable en dos fases (`prepared` → `completed`): una caída después de registrar la intención ya no puede producir un ACK falso antes de aplicar la eliminación local, y el reintento continúa exactamente desde el estado pendiente.
- Una réplica donde la card raíz ya no existe puede reconfirmar o reconstruir de forma segura la ubicación en papelera usando las capacidades firmadas de memoriaBACKEND para propietario y destinatario; la excepción queda limitada a `entity.trash` sobre la raíz `admin.project/project`, no afecta registros genéricos y nunca revive un proyecto con prueba durable de purga posterior.
- Se reforzaron las regresiones de permisos, réplica ausente, compatibilidad de comprobantes anteriores, continuidad de ACK y transición durable, preservando el flujo normal con memoriaBACKEND y el carácter opcional de los bloques `P2P_sin_`.

## 1.9.89 - 2026-08-04

- Se cerró el caso residual en el que todas las réplicas ya habían confirmado una acción crítica, pero el dispositivo iniciador podía conservar la card visible si perdía la señal final de papelera.
- La pestaña líder activa ahora un único observador autodesactivable solo para transacciones `ready` de proyectos todavía presentes; solicita nuevamente la finalización idempotente con backoff acotado y se apaga al completar, perder liderazgo, cerrar sesión, quedar offline o desaparecer el proyecto.
- Los estados de ciclo de vida se retiran junto con un espacio purgado y una respuesta no recuperable fuerza una lectura autoritativa, evitando reintentos permanentes sobre transacciones obsoletas. La regresión forma parte de la prueba de papelera P2P.

## 1.9.87 - 2026-08-03

- Se añadió sobre la lista un filtro compacto con icono de búsqueda para localizar proyectos por coincidencias parciales en nombre, descripción o dirección.
- La búsqueda normaliza mayúsculas, tildes, símbolos y varias palabras, mantiene las métricas generales sin alterarlas y muestra el total de coincidencias o un estado vacío específico.
- El filtro funciona completamente en memoria local, se limpia al cerrar sesión, incluye accesibilidad, soporte RTL, textos ES/EN/AR y regresiones integradas en la validación de la semilla.

## 1.9.85 - 2026-08-03

- Los espacios compartidos que todavía no contienen la entidad raíz administrativa ya no generan cards fantasma con nombre genérico ni métricas en cero; permanecen fuera del panel y de los totales mientras se determina si existe una réplica válida.
- La PWA solicita una recuperación dirigida únicamente para esos proyectos incompletos, sin polling y sin forzar snapshots de los demás espacios. Si otra instalación conserva la copia, la sincronización existente la restaura; si no existe una fuente disponible, la card queda retirada de la interfaz.
- memoriaBACKEND acepta objetivos explícitos de recuperación y permite solicitar una réplica incluso cuando ambas revisiones declaradas son `0`, caso necesario para reconstruir una raíz ausente sin debilitar el control normal de revisiones.
- Se añadieron mensajes de producción en español, inglés y árabe, junto con regresiones para raíz ausente, filtrado de métricas, recuperación dirigida, deduplicación y límites de espacios.

## 1.9.83 - 2026-08-03

- Cada card de proyecto y cada compra, ingreso o proyección usa ahora un menú vertical de tres puntos con opciones permitidas por rol, presentado en una ventana modal centrada y accesible.
- Las eliminaciones normales pasan a una papelera P2P sincronizada: el elemento deja de afectar métricas y vistas activas, conserva su contenido completo y puede restaurarse desde cualquier réplica autorizada. La eliminación permanente solo se ofrece dentro de la papelera y exige una segunda confirmación explicativa.
- Se incorporaron las operaciones cifradas `entity.trash`, `entity.restore` y `entity.purge` en IndexedDB, memoriaBACKEND y `P2P_sin_`, con control de versión esperada, permisos estrictos para proyecciones, guardas de referencias y compatibilidad con `entity.delete`.
- La papelera distingue proyectos completos de registros individuales, mantiene aislamiento por dominio/aplicación y dispone de textos ES/EN/AR, estilos compactos y regresiones ejecutables.

## 1.9.81 - 2026-08-03

- Corregido el despliegue que podía publicar `runtime-config.js` con `backendUrl` vacío aunque `APP_BACKEND_URL` estuviera definida en Render pero el generador de la app no se ejecutara desde el build del Static Site.
- El generador normaliza valores copiados con comillas, limpia configuraciones antiguas, valida URL HTTP(S) y el build de producción falla explícitamente cuando falta memoriaBACKEND, incluso si `sinBACKEND=true`.
- La interfaz ya no muestra el código técnico `BACKEND_NOT_CONFIGURED`; presenta un mensaje traducido de producción y conserva el código estructurado para diagnóstico. Se añadieron regresiones y documentación para apps instaladas en raíz o subcarpetas.

## 1.9.79 - 2026-08-01

- Corregido el punto débil de despliegue del modo `sinBACKEND`: el generador aceptaba la variable, pero el Blueprint del Static Site no la declaraba y una semilla creada desde `render.yaml` dejaba el bloque P2P local oculto y desactivado salvo configuración manual adicional.
- `appWEB/render.yaml` expone ahora `sinBACKEND=false` como interruptor público de build; al activarlo y redesplegar, `tools/generate-release.py` regenera `runtime-config.js` sin modificar el flujo normal con memoriaBACKEND.
- La validación PWA exige que el Blueprint conserve la variable exacta, su valor seguro por defecto y la conexión con el generador de release.

## 1.9.78 - 2026-08-01

- Corregido el punto débil de vencimiento silencioso de la capacidad `P2P_sin_`: una PWA que permanecía abierta y conectada durante varios días podía llegar a una caída de Internet con su autorización local ya vencida, porque esa capacidad solo se renovaba durante un bootstrap provocado por otro evento.
- La pestaña líder programa ahora una única renovación antes del vencimiento, sin `setInterval` ni polling. La renovación usa el bootstrap autoritativo existente, se cancela al perder liderazgo o cerrar sesión y reintenta con backoff acotado cuando memoriaBACKEND está temporalmente indisponible.
- Si el dispositivo está offline al llegar la ventana de renovación, no genera tráfico inútil: conserva la capacidad vigente y espera el evento real `online`; se añadió una regresión ejecutable para capacidades largas, cortas, atrasadas y vencidas.

## 1.9.77 - 2026-08-01

- Corregido el punto débil de reconexión de `sinBACKEND`: una interrupción Wi‑Fi transitoria retiraba el canal del mapa de envíos, pero WebRTC podía recuperarlo sin que la PWA lo reincorporara, obligando a repetir manualmente el emparejamiento.
- El transporte distingue ahora reconexión temporal de cierre definitivo, repone automáticamente el canal recuperado, vuelve a intercambiar revisiones y vaciar el outbox, y libera sesiones que no se recuperan dentro de una gracia acotada.
- El estado global ya no queda mostrando “Conectado por Wi‑Fi” cuando cayó el último par local. Se añadió una regresión ejecutable para caída, recuperación y reanudación automática.

## 1.9.76 - 2026-08-01

- Corregido el punto débil de anti-entropía en `sinBACKEND`: un dispositivo que permanecía cerrado no podía recuperar por Wi-Fi operaciones que el otro ya había confirmado y retirado de su outbox, aunque ambos conservaran una réplica autorizada.
- Al abrir un canal local, los pares intercambian revisiones firmadas y solicitan de forma dirigida un snapshot canónico, cifrado y firmado cuando detectan una brecha. La reconstrucción usa únicamente estado confirmado, verifica capacidad, identidad, permisos, digest, conteos y límites, y entre cuentas solo acepta como fuente al propietario.
- El transporte incorpora envío por sesión para impedir que una recuperación se difunda a otros pares conectados. Se añadieron regresiones para dispositivo atrasado, exclusión de capas optimistas, fuente de confianza, aislamiento del destinatario y ausencia de polling.

## 1.9.75 - 2026-08-01

- Corregido el punto débil de deriva de permisos entre memoriaBACKEND y `sinBACKEND`: una eliminación LAN se evaluaba antes que el perfil de proyecciones, permitiendo borrar una proyección con `delete` sin `projection` y rechazando operaciones válidas sobre vínculos de proyección.
- Las capacidades offline certifican ahora `resourceType` y `permissionProfile`; cliente y backend usan la misma matriz: la raíz administrativa es del propietario, una proyección requiere `projection`, su borrado exige `delete + projection` y un vínculo depende de `projection` incluso al eliminarse.
- La política especial solo se activa para espacios `admin.project` con perfil `admin-project-v1`; una app genérica puede reutilizar nombres de entidad sin heredar permisos administrativos. Se añadieron regresiones en ambos extremos.

## 1.9.74 - 2026-08-01

- Corregido el punto débil de atomicidad en `sinBACKEND`: una compra y su vínculo con una proyección se guardaban juntas localmente, pero se difundían y recuperaban como operaciones independientes por Wi-Fi, permitiendo que otra réplica observara solo una parte del cambio.
- La PWA firma y transmite ahora un `p2p.sin.signed-batch`, valida todas sus operaciones y permisos antes de escribir, aplica el lote en una única transacción IndexedDB y conserva los sobres originales para relevarlo después sin cambiar autoría.
- memoriaBACKEND incorpora `/api/p2p/events/relay-local-batch`, verifica identidad, capacidad, orden y unicidad de cada firma y usa el commit atómico normal; se mantienen el relay individual y una compatibilidad acotada para lotes parcialmente publicados por versiones anteriores.

## 1.9.73 - 2026-08-01

- Corregido el punto débil de continuidad al rotar la autoridad ES256 de `P2P_sin_`: antes toda capacidad offline vigente quedaba invalidada en cuanto cambiaba la pareja activa, por lo que dispositivos actualizados en momentos distintos podían dejar de sincronizar o relevar operaciones legítimas.
- memoriaBACKEND firma solo con la clave actual, pero anuncia y acepta un anillo acotado de públicas confiables mediante `P2P_SIN_CAPABILITY_TRUSTED_PUBLIC_JWKS`; la PWA selecciona la clave exacta declarada por `authorityKeyId` y continúa rechazando autoridades desconocidas.
- Se documentó la rotación escalonada, se añadieron las variables al Blueprint de Render y se ampliaron las regresiones del backend y del cliente para clave actual, anterior y no autorizada.

## 1.9.71 - 2026-08-01

- Cerrado el punto débil de suplantación en `sinBACKEND`: el código de emparejamiento ya no puede declarar por sí mismo cuenta, dispositivo ni permisos. memoriaBACKEND certifica el alcance offline con una capacidad ES256 temporal y vinculada a dominio + aplicación.
- Cada instalación conserva una clave ECDSA P-256 no extraíble y firma todas las operaciones LAN; el receptor valida autoridad, dispositivo, identidad del canal, proyecto, permiso y operación exacta antes de modificar IndexedDB.
- El bloque backend `P2P_sin_CAPACIDADESx` es opcional y eliminable; sin él el flujo SSE/POST continúa intacto. Se añadieron pruebas de manipulación, aislamiento entre aplicaciones, firma de dispositivo y continuidad de clave.

## 1.9.70 - 2026-08-01

- Corregido el punto débil de la ausencia total del modo `sinBACKEND`: la semilla incorpora el bloque opcional `P2P_sin_RED_LOCALx`, cargado dinámicamente y aislado por origen + aplicación, para abrir canales WebRTC directos entre dispositivos que ya fueron emparejados en la misma red Wi‑Fi.
- El panel autenticado permite crear, aceptar y completar códigos de señalización local; las operaciones autorizadas conservan el cifrado por proyecto, se validan contra la membresía y los permisos locales confirmados, se aplican en IndexedDB y quedan en el outbox para regresar al flujo autoritativo cuando memoriaBACKEND vuelva.
- La variable pública booleana `sinBACKEND` queda desactivada por defecto. Si el bloque `P2P_sin_` se elimina o WebRTC no está disponible, la carga falla de forma controlada y la aplicación continúa funcionando únicamente con memoriaBACKEND. Se documenta que una PWA estática no puede descubrir automáticamente otro móvil ni crear Web Push sin señalización previa.

## 1.9.69 - 2026-08-01

- Corregido el punto débil restante de la rotación VAPID en navegadores que conservan una suscripción Push pero no exponen `PushSubscription.options.applicationServerKey`: antes la comparación quedaba indeterminada y podía reutilizarse indefinidamente un endpoint creado con la clave anterior.
- La PWA conserva ahora una vinculación aislada por aplicación entre endpoint y clave pública VAPID. Cuando el navegador oculta la clave, reutiliza únicamente una vinculación demostrablemente vigente; una instalación heredada sin esa evidencia rota una sola vez, limpia el endpoint anterior y registra la nueva relación.
- La limpieza queda cercada por endpoint para no borrar la vinculación que otra pestaña haya renovado concurrentemente. La regresión cubre clave visible, clave oculta vigente, migración heredada, renovación simultánea y suscripción que no puede reemplazarse.

## 1.9.68 - 2026-07-31

- Corregido el punto débil de continuidad de Web Push al rotar las claves VAPID del backend: la PWA reutilizaba una suscripción creada con la clave anterior y las invitaciones podían dejar de notificarse aunque la sesión, SSE y sincronización siguieran funcionando.
- La app compara ahora de forma binaria la `applicationServerKey` vigente con la suscripción del navegador, retira primero el endpoint obsoleto del backend y crea una suscripción nueva; si otra pestaña completa la renovación simultáneamente, reutiliza ese resultado sin duplicar endpoints.
- Se añadió una regresión ejecutable para clave vigente, rotación real, renovación concurrente y navegador que no logra retirar la suscripción anterior.

## 1.9.67 - 2026-07-31

- Corregido el punto débil del aislamiento Web Push por cuenta únicamente: una suscripción reutilizada o una identidad local rotada dentro de la misma cuenta podía recibir o abrir un aviso dirigido a otra instalación de ese usuario.
- `memoriaBACKEND` impone ahora `recipientUserId` y `recipientDeviceId` autoritativos para cada suscripción; el Service Worker exige que ambos coincidan al recibir y al abrir la notificación, y las limpiezas tardías quedan cercadas por la cuenta y el dispositivo que las inició.
- La rotación de `deviceId` actualiza inmediatamente el vínculo Push local antes de reiniciar el cliente. Se ampliaron las regresiones de sesión, aislamiento de rutas, migración de identidad y límites de suscripciones.

## 1.9.66 - 2026-07-31

- Cerrado el punto débil operativo del cupo de instalaciones: la baja segura ya existía en el contrato P2P, pero no estaba expuesta en la interfaz, por lo que un usuario no podía liberar visualmente un dispositivo antiguo desde una instalación autorizada.
- El panel principal incorpora un administrador compacto de dispositivos, identifica la instalación actual, ordena y deduplica las demás, exige confirmación y conecta la acción exclusivamente con `window.SemillaP2P.retireDevice(deviceId)`, conservando las verificaciones atómicas de cobertura de réplicas del backend.
- El módulo visual queda incluido en precache, verificación de huellas y fallback del Service Worker; se añadieron traducciones ES/EN/AR y una regresión ejecutable para impedir el retiro de la instalación actual o de la única copia registrada.

## 1.9.65 - 2026-07-31

- Corregido el punto débil del cupo de instalaciones: la semilla protegía las réplicas existentes, pero no ofrecía una forma segura y reutilizable de retirar un dispositivo para liberar una posición.
- `memoriaBACKEND` incorpora una baja atómica que exige otra instalación registrada de la misma cuenta y vuelve a validar, dentro del mismo commit Redis, el índice completo de proyectos, los permisos y cada revisión autoritativa antes de eliminar dispositivo, cola, presencia, credencial realtime, suscripción Push y reporte de réplica; un cambio concurrente invalida la operación sin efectos parciales.
- La identidad retirada queda bloqueada mediante un tombstone temporal, idempotente y acotado por cuenta; `window.SemillaP2P.retireDevice(deviceId)` actualiza el estado visible sin polling. Se añadieron regresiones para réplica atrasada, avance concurrente de revisión, cambio concurrente de alcance, repetición segura, reingreso bloqueado y conexión completa del endpoint.

## 1.9.64 - 2026-07-31

- Corregido el punto débil que fechaba compras, ingresos y formularios con el día UTC: en zonas horarias americanas una operación nocturna podía quedar registrada automáticamente como si hubiera ocurrido al día siguiente.
- El dominio administrativo expone ahora una fecha calendario local reutilizable y tanto los valores predeterminados como la interfaz usan año, mes y día del dispositivo sin depender de `toISOString()`.
- Añadida una regresión ejecutable para una operación realizada a las 8:15 p. m. en Colombia, validación de entradas inválidas y una barrera que impide reintroducir el cálculo UTC en el formulario.

## 1.9.63 - 2026-07-31

- Corregida la regresión visual posterior a la precisión monetaria exacta: una proyección vinculada a suficientes facturas podía producir una variación `BigInt`, pero la etiqueta de sobrecosto todavía llamaba `Math.abs()` y detenía el renderizado del proyecto con `TypeError`.
- El dominio administrativo expone ahora una operación de valor absoluto monetario que conserva `number` para resultados seguros y `BigInt` para agregados grandes; la interfaz la usa antes de formatear la variación.
- Añadida una regresión con tres facturas máximas vinculadas a una sola proyección y una comprobación que impide reintroducir `Math.abs()` en esa ruta visual.

## 1.9.62 - 2026-07-31

- Corregido el punto débil de precisión en las métricas administrativas: aunque cada presupuesto, ingreso o factura estaba limitado a un entero seguro, la suma de varios registros podía superar `Number.MAX_SAFE_INTEGER` y redondear silenciosamente capital, gastos, disponible o variaciones.
- Las agregaciones derivadas usan ahora enteros exactos y solo vuelven a `number` cuando el resultado cabe de forma segura; el formato monetario, las proyecciones y el consolidado de todos los proyectos aceptan resultados grandes sin perder precisión ni cambiar el formato de los casos normales.
- Añadidas regresiones para capital, compras, saldos proyectados y múltiples facturas vinculadas por encima del rango seguro individual, conservando los contratos existentes para importes ordinarios.

## 1.9.61 - 2026-07-31

- Corregido el crecimiento acumulativo de fragmentos de snapshot incompletos en IndexedDB: recuperaciones interrumpidas podían dejar hasta un snapshot completo por intento durante 24 horas y agotar el almacenamiento local tras fallos móviles repetidos.
- La retención local queda alineada con la vigencia autoritativa de la concesión más un margen acotado; al iniciar una reconstrucción nueva se eliminan sesiones anteriores del mismo proyecto y los cierres inválidos, incompletos o terminalmente inconsistentes liberan de inmediato sus fragmentos.
- Se conservan snapshots activos de otros proyectos y la sesión vigente; la limpieza está cercada por `spaceId + requestId + sourceDeviceId` y cuenta con regresiones para expiración, reemplazo y descarte terminal sin borrar datos no relacionados.

## 1.9.60 - 2026-07-31

- Corregido el punto débil de recuperación por snapshots sin presupuesto acumulado: fragmentos individualmente válidos podían exceder juntos la cola temporal, perder los primeros eventos por recorte y provocar reconstrucciones incompletas repetitivas.
- El cliente calcula `snapshotByteCount` y `chunkByteCount`, limita bytes, fragmentos y costo estimado de transporte antes del primer envío, y recibe los topes autoritativos desde bootstrap.
- IndexedDB rechaza manifiestos sobredimensionados o inconsistentes y `snapshot.complete` exige que la suma de todos los fragmentos coincida exactamente antes de materializar la copia. Se añadió una regresión ejecutable para los límites preventivos del cliente y almacenamiento local.

## 1.9.59 - 2026-07-31

- Corregida una carrera de privacidad al reutilizar el mismo endpoint Web Push después de cambiar de cuenta en un dispositivo compartido: una notificación ya enviada para la cuenta anterior podía llegar cuando la nueva cuenta ya estaba activa.
- `memoriaBACKEND` incorpora siempre el `recipientUserId` autoritativo del destinatario real y descarta cualquier valor proporcionado dentro del payload; el Service Worker guarda el vínculo de cuenta por aplicación y solo muestra el aviso cuando ambos identificadores coinciden.
- La baja del vínculo queda cercada por el usuario que inició el cierre para que una operación tardía no borre la cuenta nueva; además, los avisos visibles de la cuenta anterior se cierran y un clic posterior vuelve a comprobar el destinatario. Se añadieron regresiones para entrega, apertura, supresión sin fuga de payload, logout, cambio de sesión y restauración del endpoint.

## 1.9.57 - 2026-07-31

- Corregido el estado local permanente que podía producir un HTTP 429 durante bootstrap, registro o publicación mientras el dispositivo seguía en línea: la app ya no depende de recargar ni de recibir un evento `online` adicional para volver a sincronizar.
- `memoriaBACKEND` expone `Retry-After` por CORS y la API PWA conserva segundos/instante de reintento en el error; el cliente agenda un único intento dirigido por el servidor, amplía la espera cuando llega un límite posterior y cancela el temporizador al detener o cambiar de sesión.
- La recuperación ejecuta bootstrap, outbox y SSE una sola vez al vencer la espera, queda acotada a quince minutos y no incorpora polling. Se añadió una regresión ejecutable para segundos, fecha HTTP, señal P2P, límites y ciclo de vida del temporizador.

## 1.9.56 - 2026-07-31

- Corregido el ciclo de reconexión causado por eventos heredados, dañados o manipulados que pertenecen a un proyecto cifrado pero llegan sin metadatos criptográficos o con un payload de estado en texto plano.
- La validación previa al descifrado los clasifica ahora como rechazo remoto determinista, avanza el cursor durable sin aplicar el contenido, pone en cuarentena temporal a la réplica fuente y fuerza recuperación desde otra copia autorizada.
- Se conserva el rechazo estricto de datos sin cifrar y se añade una regresión ejecutable para metadatos ausentes, payload no protegido, evento cifrado válido y continuidad del mecanismo anti-eventos venenosos.

## 1.9.55 - 2026-07-31

- Corregido el ciclo de recuperación provocado por operaciones o snapshots cifrados con ciphertext corrupto: la réplica ya no bloquea indefinidamente la cola al reintentar el mismo evento remoto imposible de autenticar.
- Los payloads remotos determinísticamente inválidos se descartan sin aplicarse, avanzan el cursor durable y activan una recuperación completa; la fuente queda en cuarentena temporal por espacio para que el bootstrap elija otra réplica autorizada.
- El cliente envía exclusiones acotadas por proyecto y el backend las normaliza, deduplica y aplica antes de priorizar fuentes, sin mezclar tenants, dominios ni aplicaciones.
- Añadidas regresiones para clasificación criptográfica, continuidad del ACK, vencimiento de cuarentena y selección de una fuente alternativa.

## 1.9.54 - 2026-07-31

- Corregido el bloqueo permanente del stream cuando un dispositivo autorizado enviaba un sobre de clave con estructura válida pero ciphertext corrupto o criptográficamente imposible de autenticar.
- Los fallos deterministas del sobre remoto se distinguen ahora de errores transitorios de IndexedDB o de sesión: el evento defectuoso se confirma sin aplicarlo, la fuente queda excluida temporalmente y se solicita la misma clave a otra réplica autorizada.
- La exclusión está acotada a 32 dispositivos, vence a los cinco minutos y agenda un único reintento al terminar la cuarentena, por lo que evita ciclos venenosos sin impedir que una fuente reparada vuelva a participar cuando no existen alternativas.
- Añadidas regresiones ejecutables para rechazo AES-GCM sin efectos locales, reenvío válido posterior, selección backend de una fuente alternativa y continuidad del cursor realtime.

## 1.9.53 - 2026-07-31

- Corregida la recuperación cuando el cursor persistido de un dispositivo queda por delante de la secuencia vigente del backend tras vencer o reiniciarse la clave temporal de Redis.
- El stream identifica explícitamente el cambio de secuencia, fuerza la reconciliación por bootstrap/snapshot y rebaja de forma cercada el cursor local para aceptar los nuevos eventos sin perder el estado funcional ya almacenado.
- Los ACK que superan la secuencia realmente emitida son rechazados; el cliente cancela sus reintentos obsoletos y reconecta para obtener el cursor autoritativo, evitando retirar eventos todavía no procesados.
- Añadidas regresiones ejecutables en backend, protocolo y PWA para cursor adelantado, restablecimiento persistente, ACK futuro y cancelación de confirmaciones pertenecientes a una secuencia anterior.

## 1.9.52 - 2026-07-31

- Corregido el arranque offline de una instalación ya autenticada: el módulo principal ya no necesita descargar Firebase desde `gstatic.com` antes de poder abrir la copia local de IndexedDB.
- El SDK de Firebase se carga de forma diferida únicamente cuando el usuario inicia o cierra sesión con Google; una falla de red limpia la promesa de carga para permitir un reintento posterior.
- Añadida una regresión ejecutable y conectada al flujo de CI que evalúa el módulo de autenticación sin acceso remoto y conserva la validación de configuración pública.


## 1.9.51 - 2026-07-31

- Corregido el alcance efectivo del Service Worker cuando una semilla vive en la raíz y comparte dominio con otras apps instaladas en carpetas.
- El worker raíz ya no intercepta ni cachea navegaciones/recursos de aplicaciones hermanas; tampoco acepta sus mensajes, les difunde recargas o avisos Push, ni las enfoca al abrir una notificación.
- Los workers instalados en carpetas conservan su aislamiento natural por `registration.scope`. La app raíz declara explícitamente sus rutas navegables y prefijos de recursos para que extensiones futuras no amplíen accidentalmente el control a todo el dominio.
- Añadida una regresión ejecutable para raíz, `contabilidad` y `facturacion`, incluyendo fetch, mensajes, broadcast y apertura de notificaciones.


## 1.9.50 - 2026-07-31

- Corregida la limpieza de Cache Storage entre múltiples aplicaciones del mismo dominio: el Service Worker ya no elimina por el prefijo general del namespace.
- La app raíz solo elimina sus propias familias `static` y `runtime`; una carpeta como `contabilidad` tampoco puede borrar las cachés de `contabilidad-pro` ni de otra aplicación hermana.
- Añadida una regresión ejecutable que valida limpieza de versiones antiguas, limpieza manual y separación exacta entre raíz, carpetas y nombres con prefijos comunes.


## 1.9.49 - 2026-07-31

- Corregido el aislamiento incompleto entre aplicaciones instaladas en carpetas del mismo dominio: ahora cada app deriva un identificador estable desde su ruta pública y lo envía al backend en API y SSE.
- Sesión, usuario cacheado, dispositivo, IndexedDB funcional, almacén criptográfico, coordinación multiventana, Firebase, idioma, actualización PWA y Cache Storage quedan separados por aplicación.
- Añadida validación ejecutable para raíz, carpetas, rutas anidadas y diferencias de alcance entre `contabilidad` y `facturacion`.


## 1.9.48 - 2026-07-31

- Cerrado el punto débil por el que una pestaña secundaria podía quedar indefinidamente con un bootstrap atrasado si se perdía la única respuesta correlacionada de estado o también el anuncio del líder promovido.
- Las solicitudes entre pestañas se retransmiten ahora con espera exponencial acotada, conservan inicialmente el destino por `tabId` y término, y solo después de superar el TTL normal del lease retiran ese destino para redescubrir al líder vigente.
- La retransmisión reutiliza el mismo `requestId`, nunca consulta `memoriaBACKEND`, se cancela al recibir una respuesta válida, al cambiar de sesión, al asumir liderazgo o al detener el cliente; por tanto no introduce polling ni rompe el liderazgo único.
- Añadida una regresión ejecutable que simula pérdida de respuestas, pérdida del anuncio de relevo, recuperación por un término nuevo y cancelación completa de temporizadores pendientes.

## 1.9.47 - 2026-07-31

- Cerrado el punto débil por el que una respuesta multiventana correlacionada solo comprobaba `requestId`: durante anuncios cruzados, un término anterior todavía podía satisfacer una solicitud destinada al líder promovido y aplicar temporalmente un estado atrasado.
- Cada solicitud de estado puede quedar dirigida al `tabId` y al término de liderazgo anunciados; solo ese líder responde y el receptor vuelve a solicitar estado si la respuesta correlacionada pertenece a otro término.
- Se conserva compatibilidad con solicitudes heredadas sin destino explícito y se amplía la regresión para cubrir respuestas cruzadas entre dos términos válidos.

## 1.9.46 - 2026-07-31

- Cerrado el punto débil por el que el lease fallback de `localStorage` todavía comparaba `expiresAt` con `Date.now()` entre pestañas: un reloj adelantado podía conservar indefinidamente un líder ya cerrado y uno atrasado podía hacer que una seguidora intentara desplazar a un líder activo.
- Cada lease incorpora ahora `heartbeatSeq`; las seguidoras observan la firma completa y miden su inactividad con un reloj monotónico local, sin comparar relojes de pared entre documentos.
- La liberación explícita continúa permitiendo relevo inmediato, mientras un lease abandonado solo puede bloquear durante el TTL local máximo aunque su fecha remota esté en el futuro.
- Ampliada la regresión multiventana con relojes opuestos, retroceso del reloj del líder, heartbeat lógico activo y recuperación de un lease abandonado con fecha futura.

## 1.9.45 - 2026-07-31

- Cerrado el punto débil por el que el relevo de la ventana líder dependía de `Date.now()`: un cambio del reloj del dispositivo podía dejar un mensaje antiguo con fecha futura y bloquear indefinidamente los estados del nuevo líder.
- Cada adquisición de liderazgo genera ahora un término único que acompaña los anuncios y estados multiventana; las seguidoras aceptan estados espontáneos únicamente del término vigente, sin comparar relojes entre documentos.
- Las solicitudes de estado incluyen un identificador correlacionado para que la respuesta del líder actual pueda establecer un nuevo término incluso después de un anuncio atrasado o un ajuste de hora, y una discrepancia fuerza reconciliación en vez de reemplazar el estado local.
- Ampliada la regresión multiventana para cubrir mensajes del líder anterior con reloj futuro, promoción con reloj inferior, rotación del término y propagación obligatoria del cerco en cada estado.

## 1.9.44 - 2026-07-31

- Cerrado el punto débil multiventana por el que una pestaña secundaria podía difundir una copia completa y atrasada del estado P2P y reemplazar directamente el estado en memoria de la pestaña líder o de otras ventanas.
- Los estados completos se aceptan ahora únicamente desde la pestaña que conserva el liderazgo realtime; las ventanas secundarias emiten invalidaciones y la líder vuelve a leer el bootstrap autoritativo antes de publicar el resultado.
- El relevo de liderazgo queda cercado por identidad y orden temporal del mensaje, descartando estados demorados del líder anterior sin impedir que una nueva ventana líder tome el control. Las invalidaciones que contienen recuperación de réplica fuerzan también la solicitud de snapshot correspondiente.
- Ampliada la regresión multiventana para cubrir estados no autoritativos, mensajes atrasados, promoción de un nuevo líder e integración obligatoria del refresco autoritativo.

## 1.9.43 - 2026-07-31

- Cerrado el punto débil por el que una invitación aceptada podía considerarse lista apenas el bootstrap confirmaba la membresía, aunque la copia IndexedDB del dispositivo todavía estuviera por debajo de la revisión autoritativa y el snapshot siguiera pendiente.
- La autorización pendiente distingue ahora entre membresía desconocida y recuperación de réplica: una membresía válida permite que la cola SSE confirme el evento de control y reciba el snapshot, pero el proyecto permanece en solo lectura hasta alcanzar la revisión del backend y limpiar el watermark de recuperación.
- La recuperación puede solicitar la clave cifrada activa sin habilitar escrituras; además, un watermark ya satisfecho se elimina al contrastarlo con la revisión local para evitar bloqueos permanentes después de un reinicio.
- La promoción a autorización confirmada se persiste únicamente después de verificar la revisión local y los requisitos de recuperación; la interfaz muestra estados específicos de sincronización y evita anunciar que el proyecto está listo antes de tiempo.
- Ampliada la regresión para validar revisiones local/autoritativa, ausencia de bloqueo circular en el stream y promoción durable después del snapshot, con paridad de textos en español, inglés y árabe.

## 1.9.42 - 2026-07-31

- Cerrado el punto débil por el que una invitación aceptada se persistía y difundía como autorización confirmada antes de que el bootstrap verificara la réplica del dispositivo.
- Las aceptaciones locales y recibidas por SSE quedan ahora en modo no confirmado y solo lectura hasta completar la recuperación autoritativa; si la lectura falla, no se habilitan escrituras ni se confirma el cursor.
- Un replay de aceptación ya no puede degradar a modo provisional un proyecto cuya réplica fue confirmada previamente.
- Ampliada la regresión para validar persistencia provisional, promoción autoritativa y replays idempotentes sin pérdida de campos.

## 1.9.41 - 2026-07-31

- Cerrado el punto débil por el que la aceptación realizada en el mismo dispositivo podía terminar como exitosa aunque el bootstrap autoritativo omitiera el proyecto o lo conservara con autorización sin confirmar.
- La aceptación local y la recibida por SSE comparten ahora una única validación: solo finalizan cuando la réplica queda confirmada o existe una revocación explícita posterior; el resultado local sustituye además el espacio provisional por el estado autoritativo.
- La interfaz distingue la carrera extrema en la que la invitación fue aceptada pero el acceso quedó revocado antes de completar la sincronización, evitando mostrar un éxito engañoso.
- Ampliada la regresión para cubrir réplica confirmada, proyecto omitido, autorización no confirmada, revocación explícita y simetría entre aceptación local y remota.

## 1.9.40 - 2026-07-31

- Cerrado el punto débil por el que una invitación aceptada desde otro dispositivo podía confirmarse en el stream sin solicitar el snapshot histórico para esta réplica, dejando el proyecto con estado parcial y únicamente cambios futuros.
- Toda aceptación recibida en tiempo real fuerza ahora un bootstrap selectivo de recuperación; el cursor y el ACK solo avanzan cuando la membresía queda confirmada o existe una revocación explícita posterior. Un fallo transitorio conserva el evento para replay.
- Los commits locales de invitación y espacio se reflejan inmediatamente en `bootstrapState`, se clasifican por cuenta y se difunden mediante `p2p:state` a la interfaz y a las demás pestañas, incluso si un bootstrap no crítico falla después.
- Añadida regresión para aceptación en otra instalación, solicitud obligatoria de snapshot, ausencia de ACK prematuro, actualización sin duplicados y aislamiento de invitaciones por cuenta.

## 1.9.39 - 2026-07-31

- Cerrado el punto débil que persistía proyecto e invitación en transacciones IndexedDB separadas después de crear, aceptar o recibir en tiempo real una invitación ya confirmada por `memoriaBACKEND`.
- Los cambios incrementales del plano de control usan ahora un único commit local sobre `spaces` e `invitations`; si cualquiera de las dos escrituras falla, la transacción aborta y no queda una mitad visible al reiniciar sin conexión.
- Añadida una regresión ejecutable que cubre acciones locales, eventos SSE y rollback completo ante una falla simulada en la segunda escritura.

## 1.9.38 - 2026-07-31

- Cerrado el punto débil que permitía aplicar un bootstrap de control en dos commits locales independientes: proyectos y revocaciones podían persistirse aunque fallara el reemplazo de invitaciones, o viceversa, dejando una aceptación incoherente después de reiniciar sin conexión.
- El grafo de proyectos, invitaciones, purgas asociadas, outbox, snapshots y metadatos afectados se reemplaza ahora dentro de una única transacción IndexedDB; el estado en memoria y los límites del relay solo cambian después de confirmar ese commit.
- Si una tarea posterior al commit —como reconciliar requisitos de snapshot— falla, la secuencia del bootstrap se conserva como aplicada para impedir que una respuesta anterior tardía sobrescriba el estado autoritativo ya persistido.
- Añadida una regresión ejecutable que cubre fallo previo al commit, fallo posterior al commit y respuesta antigua fuera de orden.

## 1.9.37 - 2026-07-31

- Cerrado el punto débil por el que un bootstrap iniciado antes de una revocación, eliminación, invitación, cambio de permisos o activación de clave podía aplicarse tarde y restaurar el grafo anterior si la lectura autoritativa posterior fallaba.
- La PWA cerca todas las respuestas previas a una mutación confirmada y espera cualquier aplicación que ya hubiera comenzado antes de purgar, guardar o reemplazar el estado local; así un proyecto eliminado o una membresía revocada no reaparecen por una respuesta HTTP atrasada.
- La barrera se aplica a cambios recibidos por SSE, brechas de replay y acciones locales del plano de control y cambios de autoridad criptográfica, sin perder la mejora anterior que permite aprovechar una respuesta concurrente válida cuando no existe ninguna mutación autoritativa.
- Ampliada la regresión de concurrencia para cubrir una actualización posterior fallida, una respuesta anterior todavía en red y un bootstrap que ya había empezado a modificar IndexedDB.

## 1.9.36 - 2026-07-31

- Cerrada la carrera entre lecturas concurrentes del bootstrap: iniciar una solicitud posterior ya no descarta una respuesta válida anterior antes de saber si la nueva lectura podrá aplicarse.
- El cliente conserva una secuencia independiente de bootstraps realmente aplicados; solo una respuesta posterior aplicada con éxito puede volver obsoleta una respuesta anterior, y una respuesta tardía nunca revierte un estado más nuevo.
- Añadida una regresión que cubre la segunda lectura fallida y el orden inverso de respuestas, protegiendo el ACK de permisos, membresía y propiedad frente a estados locales anteriores.

## 1.9.35 - 2026-07-31

- Cerrado el punto débil entre la recepción de `p2p.membership.changed` y su confirmación: una falla temporal del bootstrap ya no se absorbe antes de avanzar el cursor.
- Los cambios de permisos, membresía y propiedad solo generan ACK después de aplicar el estado autoritativo y confirmar que el proyecto afectado está presente; si la lectura falla o llega incompleta, la tubería se bloquea, reconecta y reproduce el evento desde el último cursor durable.
- La señal de interfaz usa el espacio obtenido del bootstrap confirmado, no el grafo transportado potencialmente superado, y una regresión ejecutable valida tanto el fallo recuperable como el camino exitoso.

## 1.9.34 - 2026-07-31

- Cerrado el punto débil que permitía aceptar `p2p.membership.changed` con un grafo completo pero sin declarar qué transición de acceso lo produjo.
- La PWA y `P2P_SINCRONIZACIONx` exigen ahora exactamente una variante canónica por evento: revocación, transferencia de propiedad o actualización de permisos; sobres vacíos o que mezclan variantes bloquean la tubería antes de aplicar estado o avanzar el ACK.
- Añadidas regresiones simétricas frontend/backend para impedir reemplazos ambiguos del grafo y combinaciones incompatibles de revocación con permisos.

## 1.9.33 - 2026-07-31

- Cerrada la contradicción semántica restante en eventos críticos de control: propietario, roles, permisos, actor, destinatario y estado de invitación deben coincidir con el grafo de membresía que acompaña el evento.
- `memoriaBACKEND` y la PWA aplican la misma validación canónica antes de encolar, materializar, purgar o confirmar el cursor; eliminaciones atribuidas a otra cuenta, falsas salidas voluntarias, propietarios inexistentes y aceptaciones sin el invitado ya no avanzan.
- `P2P_DESPACHOx` reconoce efectos superados por cambios posteriores de membresía, propiedad o permisos, los completa sin reintentos infinitos ni purgas obsoletas y mantiene las respuestas históricas por Web Push cuando corresponde.
- Añadidas regresiones simétricas para grafos de miembros, permisos exactos, invitaciones aceptadas/rechazadas y causalidad del outbox, incluida una aceptación vigente después de que el remitente original abandona el espacio.

## 1.9.32 - 2026-07-31

- Cerrado el punto débil que permitía confirmar el cursor de eventos críticos de control con identidad básica válida pero con datos semánticos incompletos o contradictorios.
- `memoriaBACKEND` valida antes de encolar revocaciones, eliminaciones, cambios de membresía, invitaciones, solicitudes y sobres de clave y solicitudes de snapshot; la PWA repite la validación antes de purgar, guardar, compartir claves o avanzar el ACK.
- Una invitación aceptada ya no se despacha si no puede reconstruirse su espacio y membresía: la tarea permanece recuperable para reintento en vez de entregar una aceptación incompleta.
- Añadidas regresiones simétricas frontend/backend para relaciones de identidad, estado de invitación, espacio aceptado, épocas de clave y brechas reales de snapshot.

## 1.9.31 - 2026-07-31

- Cerrado el punto débil que permitía aceptar un `p2p.operation` con sobre de transporte válido pero sin identidad completa, `spaceSequence` o `stateRevision` canónicas.
- La PWA valida ahora identidad del evento, secuencia de transporte, tipo de operación, espacio, actor, dispositivo fuente, identificador, payload, entidad y relación coherente entre secuencia y revisión antes de descifrar, aplicar o confirmar el evento.
- La misma barrera se ejecuta justo antes de toda escritura canónica —stream, respuesta directa, lote o replay cifrado diferido—; mutaciones sin revisión positiva y snapshots con revisión distinta de cero ya no pueden crear estados optimistas fantasma sin outbox reconciliable.
- Añadida regresión para stream y respuesta directa válidos, snapshot válido, identidad o secuencias ausentes, revisión durable nula, entidad incompleta, payload inválido, revisión imposible y guardia central de aplicación individual o atómica.

## 1.9.30 - 2026-07-31

- Cerrada la omisión silenciosa de eventos SSE semánticamente inválidos: un JSON válido sin `eventId`, `eventType` o `deviceSequence` segura ya no puede quedar ignorado mientras un evento posterior adelanta el cursor.
- La PWA valida el sobre de protocolo antes de encolarlo y exige continuidad exacta de la secuencia privada del dispositivo tanto para eventos individuales como para lotes atómicos; saltos y reproducciones bloquean la tubería y fuerzan replay desde el cursor durable.
- Separada la última secuencia aceptada del stream respecto del cursor durable: después de `p2p_gap` se pueden recibir los chunks de snapshot posteriores sin confirmar prematuramente la brecha.
- Añadida regresión para sobres incompletos, secuencias fraccionarias, saltos, reproducciones, continuidad de lotes y recuperación por snapshot.

## 1.9.29 - 2026-07-31

- Corregida la frontera que permitía continuar el stream después de recibir un evento SSE con JSON inválido y confirmar posteriormente un cursor que dejaba ese cambio omitido de forma permanente.
- Cualquier payload inválido de `p2p_event` o `p2p_gap` bloquea ahora la tubería, limpia lotes atómicos parciales, cierra la conexión y fuerza replay desde el último cursor durable sin avanzar ACK.
- Añadida regresión específica para recuperación tipada, reconexión única y preservación del orden canónico.

## 1.9.28 - 2026-07-31

- Cerrada la espera indefinida de una réplica cuando el stream entrega solo una parte de un lote atómico y permanece abierto sin emitir error ni eventos posteriores.
- El ensamblador inicia un vencimiento cercado por sesión y generación; si el lote no se completa, bloquea la tubería, libera el buffer, cierra la conexión y fuerza replay desde el último cursor durable sin aplicar ni confirmar operaciones parciales.
- El temporizador se cancela al completar el lote, cambiar de cuenta, detener la PWA o reconstruir la tubería. Añadida regresión de truncamiento silencioso, reconexión única y limpieza de memoria.

## 1.9.27 - 2026-07-31

- Corregida la frontera que todavía permitía observar parcialmente en una réplica un lote ya comprometido de forma atómica en memoriaBACKEND: los eventos canónicos incluyen ahora `batchId`, `batchIndex` y `batchSize`.
- El cliente ensambla el lote completo, valida identidad y secuencias contiguas y materializa entidades, confirmaciones del outbox y revisión aplicada dentro de una sola transacción IndexedDB antes de emitir eventos hacia la interfaz o avanzar el ACK.
- La misma garantía se aplica al replay cifrado diferido y al fallback ordenado del dispositivo emisor. Una interrupción o intercalación bloquea la tubería y fuerza replay sin publicar un estado administrativo intermedio.
- Añadidas regresiones de ensamblaje, orden, commit único, aborto explícito y visibilidad posterior al commit; se conserva compatibilidad individual con eventos históricos que no declaran lote.

## 1.9.26 - 2026-07-31

- Cerrada la frontera de aceptación parcial del lote compra + vínculo de proyección: las operaciones relacionadas ya no se confirman mediante POST independientes cuando el outbox conserva el lote completo.
- Nuevo `POST /api/p2p/events/publish-batch` valida todos los permisos, membresías y la clave activa y después asigna secuencias, incrementa revisiones, escribe todas las colas y registra la idempotencia dentro de un único script Lua; el lote se confirma completo o no produce efectos.
- La PWA reanuda lotes offline con una sola llamada, vuelve a cifrar todas sus operaciones bajo la misma autoridad, revierte el rechazo completo en una única transacción IndexedDB y mantiene compatibilidad individual para operaciones parcialmente confirmadas por versiones anteriores.
- El parser JSON ampliado se limita exclusivamente al endpoint de lote y conserva el límite menor del resto de la API. Añadidas regresiones de commit único, rechazo total, migración compatible y permisos por operación.

## 1.9.25 - 2026-07-31

- Corregida la ventana de pérdida entre una compra y su vínculo estricto con una proyección: un cierre después de guardar la compra ya no puede dejar la segunda intención sin persistir.
- `publishBatch()` prepara y cifra las operaciones relacionadas, aplica sus capas optimistas y guarda todo el outbox dentro de una única transacción IndexedDB antes de usar la red, con orden e identificadores estables para reanudación.
- Si una operación del lote recibe un rechazo permanente, las operaciones posteriores que dependían de ella se cancelan y revierten localmente; si la compra ya fue aceptada y solo falla el vínculo, la compra se conserva y la interfaz informa el estado parcial sin falsear las métricas.
- Añadida regresión reutilizable para atomicidad local, cola offline, orden del lote, aceptación completa y rechazo parcial.

## 1.9.24 - 2026-07-30

- Corregido el punto débil de transferencia de propiedad sin réplica recuperable: ya no se puede convertir en propietario a una cuenta que no tenga al menos un dispositivo con la revisión completa aplicada en IndexedDB.
- La validación ocurre dentro del mismo script Lua que cambia los roles y vuelve a leer la revisión vigente, el registro del dispositivo y su reporte temporal; una operación concurrente no puede dejar al nuevo propietario atrasado en el instante del commit.
- La interfaz advierte la precondición y presenta un mensaje localizado en ES/EN/AR; se añadió una regresión reutilizable para impedir transferencias que romperían la única raíz de recuperación entre cuentas.

## 1.9.23 - 2026-07-30

- Corregido el punto débil entre ACK de transporte y réplica durable: retirar un evento de la cola ya no confirma por sí solo que el contenido fue descifrado, aplicado y persistido en IndexedDB.
- El cliente envía `appliedStateRevisions` leídas después del procesamiento local; memoriaBACKEND las valida contra el tramo ACKeado y registra únicamente ese estado aplicado.
- `replicaRevisionHints` queda como techo de transporte compatible, no como prueba de cobertura; snapshots parciales y eventos cifrados diferidos ya no pueden marcar una copia como actualizada antes de tiempo.
- La reproducción posterior de eventos cifrados renueva la salud de réplicas, los reintentos de ACK conservan los espacios pendientes y se añadieron regresiones backend, HTTP y PWA.

## 1.9.22 - 2026-07-30

- Corregido el punto débil de redundancia invisible: la PWA ya no confunde conexión o entrega de eventos con una copia realmente actualizada.
- Nuevo bloque reutilizable `P2P_REPLICASx` registra únicamente revisiones temporales por dispositivo y calcula cobertura saludable, degradada, única, no confirmada o desconocida sin almacenar contenido funcional.
- Los ACK derivan la revisión realmente procesada, el bootstrap declara la revisión local y `/api/p2p/replicas/health` expone métricas agregadas autorizadas.
- Cada tarjeta y cabecera de proyecto muestran copias confirmadas versus registradas; la actualización está desacoplada de la carga de entidades para no degradar el panel.
- Añadidas regresiones de revisión adelantada, snapshot, privacidad y contrato HTTP; actualizados límites Render, documentación e idiomas ES/EN/AR.

## 1.9.21 - 2026-07-30

- Cerrada la autorización excesiva sobre la raíz administrativa: un participante con `add` ya no puede modificar nombre, dirección o presupuesto inicial, y `delete` tampoco permite borrar la entidad `admin.project`.
- `memoriaBACKEND` exige ahora rol de propietario para cualquier mutación durable de `admin.project`, incluso si un cliente modificado intenta saltarse la interfaz.
- La PWA oculta y bloquea la edición del proyecto para participantes, revalida la propiedad al enviar el formulario y conserva compras, ingresos y proyecciones bajo sus permisos granulares.
- La recuperación por snapshot de `admin-project-v1` también conserva esa frontera: otra cuenta solo puede reconstruirse desde un dispositivo del propietario; los dispositivos de una misma cuenta mantienen recuperación entre sí.
- Añadidas regresiones de backend y frontend para propietario, colaborador con permisos completos, concesiones obsoletas y revalidación al enviar el formulario.

## 1.9.20 - 2026-07-30

- Corregida la carrera de respuesta de invitaciones entre instalaciones: la interfaz ya no decide recuperación ni mensaje por el botón local, sino por el estado canónico `accepted`/`rejected` devuelto por memoriaBACKEND.
- Una aceptación que ganó en otro dispositivo solicita snapshot y clave aunque esta instalación hubiera pulsado rechazar; un rechazo ganador evita iniciar recuperación aunque aquí se hubiera pulsado aceptar.
- Añadida regresión reutilizable para decisiones canónicas de invitación.

## 1.9.19 - 2026-07-30

- Cerrada la difusión parcial del estado durable: `entity.put`, `entity.patch`, `entity.delete` y `custom` ya no pueden dirigirse a un subconjunto de dispositivos autorizados.
- El cliente rechaza esa intención antes del POST y memoriaBACKEND la vuelve a validar con `P2P_PARTIAL_STATE_DELIVERY_FORBIDDEN`; el dispositivo emisor siempre recibe la confirmación canónica ordenada.
- Los snapshots conservan su destino único porque siguen ligados a una concesión temporal del dispositivo solicitante; no se alteró su flujo de recuperación.
- Añadidas regresiones de backend, cliente y smoke PWA, y actualizado el contrato de reutilización.

## 1.9.18 - 2026-07-30

- Corregida la eliminación incompleta de compras vinculadas: borrar una compra ya no deja un `admin.projection-link` activo y huérfano que bloquee posteriormente la eliminación de su proyección.
- `SemillaP2P.delete()` incorpora un contrato cerrado de `dependentDeletes`; únicamente permite eliminar el vínculo cuyo identificador coincide con la compra origen y cada réplica aplica ambos cambios dentro de la misma transacción local.
- La metadata del borrado dependiente forma parte del AAD de AES-GCM, el backend rechaza relaciones o identificadores distintos y una confirmación rechazada revierte tanto la compra como su vínculo optimista; clientes actualizados recuperan de forma autenticada el contrato si un relay anterior omitió ese campo.
- La interfaz limpia vínculos huérfanos creados por versiones anteriores antes de borrar una proyección; añadidas regresiones de contrato, cifrado, manipulación, aplicación canónica, cola offline y reversión.

## 1.9.17 - 2026-07-30

- Cerrada la integridad referencial incompleta del modelo estricto: una proyección vinculada mediante `admin.projection-link` ya no puede eliminarse por una carrera concurrente.
- Los vínculos activos declaran `referenceRequirements` y solo se aplican si la proyección referenciada continúa activa en el orden canónico; un vínculo tardío queda como no-op explícito en lugar de apuntar a una entidad eliminada.
- El borrado de proyecciones usa `referenceGuards` contra `admin.projection-link` en proyectos `admin-project-v1` y conserva la guarda heredada contra `admin.purchase` para proyectos anteriores.
- Añadidas regresiones para ambos órdenes de la carrera, normalización del contrato, propagación del cliente y mensajes ES/EN/AR; actualizada la documentación reutilizable.

## 1.9.16 - 2026-07-30

- Corregida la autorización incompleta al borrar proyecciones: `delete` por sí solo ya no permite eliminar planificación financiera protegida por `projection`.
- El backend exige atómicamente la capacidad compuesta `delete_projection`, satisfecha únicamente por propietario, `write` heredado o la combinación `delete + projection`.
- La interfaz oculta y bloquea la acción de borrado cuando falta cualquiera de los dos permisos, con mensajes ES/EN/AR.
- Añadidas regresiones para impedir que futuras refactorizaciones vuelvan a reducir esta operación sensible a un solo permiso.

## 1.9.15 - 2026-07-30

- Cerrada la separación incompleta entre `add` y `projection`: una compra cifrada ya no puede alterar métricas proyectado/real incrustando directamente un `projectionId` cuando el colaborador carece del permiso de proyección.
- Los proyectos administrativos nuevos declaran el perfil inmutable `admin-project-v1` y modelan la relación compra-proyección mediante `admin.projection-link`, autorizada por `memoriaBACKEND` exclusivamente con `projection`, incluso al eliminarla.
- La interfaz oculta el selector de proyección sin permiso, conserva compras normales con `add`, soporta cola offline para compra y vínculo, y mantiene compatibilidad de lectura con proyectos heredados.
- Añadidas regresiones de dominio, creación idempotente, perfil de permisos y rechazo HTTP 403 para vínculos no autorizados; actualizados textos ES/EN/AR y huellas de release.

## 1.9.14 - 2026-07-30

- Cerrada la colisión de identidad entre instalaciones clonadas o restauradas: un `deviceId` ya registrado no puede sustituir silenciosamente su clave pública ECDH.
- `memoriaBACKEND` responde con `P2P_DEVICE_IDENTITY_CONFLICT` antes de alterar el registro, la cola, el cursor, el SSE o las suscripciones del dispositivo legítimo.
- La PWA asigna automáticamente un `deviceId` nuevo, conserva y religa el outbox y las capas optimistas pendientes, y reinicia la sincronización sin perder el modo de snapshot para dispositivos nuevos.
- Añadidas regresiones para continuidad de clave, conservación de operaciones locales, recuperación multiventana, cancelación segura por logout y ausencia de esperas circulares o recursivas durante el reinicio.

## 1.9.13 - 2026-07-30

- Corregida la ventana de confidencialidad posterior a una revocación: retirar un participante ahora marca atómicamente el proyecto con una rotación de clave obligatoria cuando ya existía una clave compartida.
- `memoriaBACKEND` rechaza operaciones funcionales y snapshots con `P2P_KEY_ROTATION_REQUIRED` hasta que el propietario active una clave distinta; reutilizar la misma clave no puede cerrar la barrera.
- La PWA reconoce el estado autoritativo, rota y redistribuye automáticamente la clave desde el dispositivo propietario y conserva el outbox bloqueado por proyecto en dispositivos no propietarios.
- Añadidas regresiones que prueban bloqueo antes de rotar, rechazo de la misma clave, reapertura tras una época nueva y recuperación automática del cliente.

## 1.9.12 - 2026-07-30

- Corregida la creación partida entre `memoriaBACKEND` e IndexedDB: un cierre, recarga o fallo después de confirmar el espacio ya no deja la intención original únicamente en memoria.
- Cada alta conserva antes del primer POST un registro local acotado con `requestId`, `operationId`, contenido administrativo y, cuando existe, `spaceId`; el mismo registro se reanuda al volver a iniciar sesión.
- La publicación inicial acepta una identidad de operación estable, evita crear un segundo espacio, no duplica una entidad ya aplicada y transfiere la responsabilidad al outbox cuando la red cae después del guardado local.
- Añadida regresión que interrumpe el flujo justo después de resolver el espacio, reinicia la operación y verifica reanudación idempotente, limpieza del intent y compatibilidad offline.

## 1.9.11 - 2026-07-30

- Corregida la carrera del fallback multiventana cuando Web Locks no está disponible: dos pestañas ya no confirman liderazgo a partir de lecturas anteriores del mismo lease de `localStorage`.
- Cada reclamación usa un token de cercado, espera una ventana breve de estabilización y vuelve a verificar propietario, token y vencimiento antes de activar SSE, ACK, snapshots u outbox.
- `BroadcastChannel` arbitra de forma determinista cuando `localStorage` está bloqueado; los anuncios de otro líder revalidan el lease y degradan inmediatamente a la candidata desplazada.
- Ampliada la regresión multiventana con una carrera simultánea forzada, validación del token ganador y coordinación entre pestañas sin almacenamiento compartido disponible.

## 1.9.10 - 2026-07-30

- Corregido el liderazgo realtime al entrar y volver desde BFCache: una pestaña congelada ya no conserva Web Lock, lease local, SSE, ACK ni vaciado de outbox mientras otra ventana puede asumir la instalación.
- `P2PTabCoordinator` suspende sin destruir la sesión local en `pagehide.persisted`, libera la exclusión y revalida el liderazgo en `pageshow.persisted` antes de reabrir sincronización.
- Una página restaurada respeta al líder vigente y queda como seguidora; si la exclusión está libre, recupera bootstrap, outbox y stream mediante el ciclo normal de cambio de liderazgo.
- Ampliada la regresión multiventana para cubrir liberación, relevo, restauración sin doble líder y recuperación posterior tanto del ciclo de página como del bloqueo compartido.

## 1.9.9 - 2026-07-30

- Corregida la revocación incompleta entre pestañas: borrar, abandonar o perder acceso a un proyecto ahora se retransmite como evento de control por `BroadcastChannel`, además del estado ordinario.
- Cada pestaña retira de inmediato el proyecto, sus invitaciones en memoria y sus watermarks de recuperación, aunque el bootstrap posterior de memoriaBACKEND esté retrasado o temporalmente indisponible.
- La interfaz cierra diálogos de acceso, invitación y edición cuando el proyecto activo fue retirado, evitando que una ventana secundaria conserve acciones o permisos obsoletos.
- Añadidas regresiones dinámicas y verificaciones estáticas para emisión, recepción, ausencia de eco y limpieza multiventana de borrados y revocaciones.

## 1.9.8 - 2026-07-30

- Cerrado el ciclo de vida de los proyectos: el propietario puede eliminarlos definitivamente desde el panel de acceso, con confirmación irreversible y sin exponer destinos internos.
- memoriaBACKEND elimina atómicamente espacio, membresías, índices, secuencias y revisiones; conserva tombstones acotados y una tarea recuperable para retirar las réplicas de todos los dispositivos conocidos.
- El evento determinista `p2p.space.deleted` y Web Push purgan IndexedDB, outbox, snapshots y claves locales al reconectar; las invitaciones pendientes del proyecto eliminado dejan de mostrarse.
- Añadidas regresiones de autorización, fallo antes del commit, idempotencia tras respuesta perdida, fan-out multidispositivo, privacidad HTTP y purga local; actualizados textos ES/EN/AR y documentación.

## 1.9.7 - 2026-07-30

- Corregida la pérdida del historial proyectado/real: una proyección vinculada a compras activas ya no puede eliminarse ni dejar referencias huérfanas.
- `SemillaP2P.delete()` admite guardas referenciales genéricas, acotadas y cifradas; cada réplica las evalúa contra el estado canónico ordenado y conserva la entidad con conflicto visible ante carreras concurrentes.
- Cada proyección completada muestra su valor real y la variación individual, indicando de forma explícita si quedó sobre presupuesto, por debajo o exacta.
- Añadidas regresiones para normalización de guardas, protección optimista/canónica, contrato del cliente y estados de variación; actualizados textos ES/EN/AR y documentación de reutilización.

## 1.9.6 - 2026-07-30

- Corregida la amplificación de recuperación: un salto en la cola ya no crea watermarks ni snapshots para proyectos cuya revisión local coincide con la revisión autoritativa.
- El modo `force` conserva la consulta inmediata al backend, pero solo concede snapshots donde `stateRevision` demuestra una diferencia real.
- Un proyecto atrasado mantiene su recuperación pendiente sin consumir tráfico, CPU ni presupuesto de publicación de los demás proyectos legibles.
- Ampliadas las regresiones del backend y la PWA para cubrir saltos recuperables y solicitudes forzadas sobre réplicas ya vigentes.

## 1.9.5 - 2026-07-30

- Corregido el bloqueo en cabecera del outbox: una clave pendiente o autoridad criptográfica no recuperable de un proyecto ya no detiene la sincronización de los demás proyectos del dispositivo.
- El vaciado conserva el orden estricto dentro de cada proyecto, omite durante ese ciclo únicamente el espacio bloqueado y permite confirmar operaciones independientes de otros espacios.
- Los fallos globales de sesión, red o disponibilidad de `memoriaBACKEND` siguen cortando el lote completo para evitar recorrer todos los proyectos y provocar una tormenta de reintentos.
- Añadida regresión dinámica para aislamiento entre proyectos, preservación de operaciones pendientes y corte seguro ante HTTP 503.

## 1.9.4 - 2026-07-30

- Corregido el acoplamiento del relay que exigía el permiso heredado `write` para cualquier entidad que no perteneciera al ejemplo `admin.*`.
- `entity.put`, `entity.patch` y `custom` ahora usan `add` como capacidad genérica; `entity.delete` conserva `delete` y `admin.projection` mantiene su regla explícita `projection`.
- Añadida una regresión dinámica que demuestra escritura de entidades futuras con `add` y bloquea eliminación o proyecciones cuando faltan sus permisos específicos.
- Actualizados contrato y arquitectura para que nuevas interfaces puedan reutilizar la semilla sin modificar el protocolo ni introducir permisos invisibles.

## 1.9.3 - 2026-07-30

- Eliminada la purga por ausencia: un espacio que no aparezca temporalmente en el bootstrap se conserva como copia local de solo lectura.
- Revocación y abandono registran atómicamente un tombstone acotado por cuenta; el bootstrap lo entrega mediante `revokedSpaceIds` y solo esa evidencia permite borrar datos y claves locales.
- Bloqueadas edición, sincronización, outbox, invitaciones, permisos y distribución de claves mientras la autorización permanezca sin confirmar.
- Añadida señal visual **Copia local**, textos ES/EN/AR, documentación de recuperación y regresiones para omisión, preservación y revocación explícita.

## 1.9.2 - 2026-07-30

- Eliminada la exposición del nombre real del proyecto en solicitudes de creación e invitación hacia memoriaBACKEND.
- Espacios, invitaciones, tareas de despacho y Web Push conservan únicamente metadatos de control y usan etiquetas genéricas antes de que el invitado reconstruya la réplica cifrada.
- Agregado saneamiento Lua atómico para retirar títulos de espacios e invitaciones heredadas y saneamiento cercado por lease para tareas antiguas del outbox, sin perder sus TTL.
- Añadida regresión de privacidad que bloquea futuras filtraciones desde rutas HTTP, cliente P2P, documentos públicos y notificaciones.
- Preservada la idempotencia de solicitudes pendientes creadas por versiones anteriores, comparando únicamente tipo de recurso, destinatario y permisos al migrar huellas que incluían el título.

## 1.9.1 - 2026-07-30

- Corregido el reintento agresivo del ACK del stream: una caída de `memoriaBACKEND` ya no provoca solicitudes cada 250 ms de forma indefinida.
- Los ACK quedan serializados a una sola solicitud en vuelo, conservan el cursor más alto y usan retroceso exponencial de 1 a 30 segundos hasta recuperar el servicio.
- Mientras el dispositivo está sin conexión no se programan solicitudes; al volver la red o asumir el liderazgo entre pestañas se confirma inmediatamente el cursor persistido.
- Añadida regresión dinámica para fallo temporal, pausa offline, recuperación y concurrencia de cursores sin introducir polling.

## 1.9.0 - 2026-07-30

- Cerrada la degradación de claves entre dispositivos: cada proyecto publica una identidad de clave activa y una época autoritativa en el plano de control temporal de memoriaBACKEND.
- La activación y rotación usan comparación atómica de la clave esperada; reintentos idénticos son idempotentes y carreras entre instalaciones propietarias reciben conflicto sin confirmar dos claves distintas.
- Solicitudes, sobres de clave y operaciones cifradas que usen una clave anterior son rechazados por el backend.
- Las ediciones pendientes ya no se revierten cuando una clave rota durante la publicación: el outbox conserva la intención local, refresca la autoridad, vuelve a cifrar y reintenta en orden.
- Los errores de autoridad se propagan con códigos estables entre memoriaBACKEND y la PWA para distinguir una rotación recuperable de un rechazo funcional permanente.
- IndexedDB conserva la época activa y la PWA descarta sobres o solicitudes retrasadas antes de activar o redistribuir una clave obsoleta, incluso en una instalación sin historial local.
- Los proyectos heredados se inicializan al abrirlos con su propietario; otros participantes no pueden crear invitaciones nuevas hasta que exista la autoridad de cifrado.
- Ampliadas las regresiones de cifrado, núcleo P2P, contrato HTTP y estado local para cubrir rotación, idempotencia, cercado CAS y entrega retrasada.

## 1.8.9 - 2026-07-30

- Corregida la asociación Web Push que podía permanecer activa después de cerrar sesión o perder una sesión vencida en un dispositivo compartido.
- El logout libera primero el endpoint en memoriaBACKEND mientras la credencial anterior todavía es válida; si el backend no responde, la PWA invalida localmente la suscripción para impedir avisos de la cuenta anterior.
- Una baja tardía se descarta si el token cambió durante la operación; el logout tampoco envía `/api/auth/logout` con la credencial de una cuenta nueva abierta concurrentemente.
- Si el fallback offline invalida el endpoint local, el siguiente acceso con permiso ya concedido recrea y registra automáticamente la suscripción sin volver a solicitar autorización.
- Ampliada la regresión de aislamiento para cubrir liberación autenticada, cierre offline, sesión expirada, restauración automática y cambio de cuenta durante la baja Push.

## 1.8.8 - 2026-07-30

- Corregido el enlace profundo de invitaciones Web Push: al tocar la notificación, la PWA conserva el identificador durante autenticación/bootstrap y abre automáticamente la invitación pendiente correcta.
- Las notificaciones recibidas con la aplicación ya abierta ahora disparan una actualización puntual del estado, sin polling, y enfocan la acción de aceptar cuando la invitación pertenece a la cuenta activa.
- El parámetro temporal se elimina de la URL solo después de encontrar la invitación autorizada, evitando reaperturas y sin mostrar invitaciones de otra cuenta.
- Añadida regresión específica y seguimiento offline en Service Worker, metadatos y huellas de release.

## 1.8.7 - 2026-07-30

- Corregido el aislamiento de cuenta entre pestañas y ventanas: cada sesión P2P queda vinculada al token con el que se inició y se invalida inmediatamente si otra ventana cierra sesión o cambia de cuenta Google.
- Las respuestas HTTP autenticadas que terminan después de un cambio de token se descartan antes de aplicar datos, evitando que un bootstrap de otra cuenta reemplace espacios dentro de la IndexedDB todavía seleccionada para la cuenta anterior.
- La interfaz detiene stream, outbox y recuperaciones antes de adoptar la sesión externa; cierra diálogos, elimina estado visual sensible y reconstruye el panel únicamente con el usuario confirmado por `/api/bootstrap`.
- El cierre de sesión usa borrado condicionado para no eliminar un token más reciente creado por otra ventana y evita cerrar la sesión Firebase de la cuenta nueva por una carrera tardía.
- Añadida regresión `session-isolation-smoke.mjs` para cambios de token durante solicitudes, propagación por `storage`, cierre condicionado y límites de contexto P2P.

## 1.8.6 - 2026-07-30

- Corregida la carrera multiventana de una misma instalación: pestañas y ventanas ya no abren streams SSE independientes ni administran en paralelo el mismo cursor y ACK del dispositivo.
- Agregado `p2p-tab-coordinator.js`, con liderazgo exclusivo mediante Web Locks y lease local como fallback, relevo automático al cerrar la ventana principal y coordinación sin polling.
- Las ventanas seguidoras reciben estado, operaciones y conexión por `BroadcastChannel`; sus operaciones offline avisan al líder para vaciar el outbox compartido sin duplicar entregas.
- La identidad de ventana ahora es efímera por documento para resistir pestañas duplicadas con `sessionStorage` clonado; BFCache conserva el liderazgo y una pérdida de liderazgo invalida tokens SSE tardíos y detiene recuperaciones snapshot locales.
- Añadida regresión para liderazgo único, propagación local, ausencia de eco y promoción del seguidor, junto con precache y huellas de release del nuevo módulo.

## 1.8.5 - 2026-07-29

- Corregidos los permisos congelados después de aceptar una invitación: el propietario ahora puede ampliarlos o reducirlos sin revocar, redistribuir claves ni volver a invitar.
- Agregado editor compacto de lectura, agregar, eliminar y proyecciones dentro del panel de participantes, con textos ES/EN/AR y diseño responsivo.
- La actualización se confirma atómicamente con validación de propietario vigente y outbox recuperable; los dispositivos reciben un único `p2p.membership.changed` determinista.
- Añadidas regresiones para permisos desconocidos, interrupción previa/posterior al commit, no-op idempotente, transferencia concurrente y bloqueo inmediato de escritura.

## 1.8.4 - 2026-07-29

- Corregido el punto débil que dejaba inaccesible desde la interfaz el ciclo ya implementado de administración de membresías.
- Agregado un panel compacto de participantes para revocar acceso, transferir la propiedad y abandonar voluntariamente un proyecto, con confirmación explícita antes de cada acción.
- La revocación muestra el resultado real de la rotación de clave: si la membresía se retira pero la renovación criptográfica queda pendiente, la interfaz advierte que no debe agregarse información sensible hasta reconectar.
- Añadidos textos ES/EN/AR, estilos responsivos y comprobaciones PWA para impedir que estas capacidades vuelvan a desaparecer por regresión.

## 1.8.3 - 2026-07-29

- Corregida la eliminación desactualizada que podía borrar silenciosamente una compra, ingreso o proyección modificada en paralelo por otro colaborador.
- Las eliminaciones nuevas incluyen una condición sobre el valor observado; si el registro cambió antes de recibir orden global, la réplica conserva la versión reciente y muestra un conflicto visible.
- La condición viaja cifrada de extremo a extremo, mientras las eliminaciones antiguas sin condición continúan siendo aceptadas para no romper outbox o clientes previos.
- Ampliadas las pruebas de reducer, cifrado cliente y validación del relay para cubrir edición concurrente frente a eliminación.

## 1.8.2 - 2026-07-29

- Corregida la pérdida silenciosa de cambios cuando dos colaboradores editan simultáneamente el mismo proyecto, compra, ingreso o proyección.
- Las ediciones existentes usan parches condicionales por campo: preservan valores remotos que cambiaron desde que se abrió el formulario y aplican únicamente campos no conflictivos.
- Agregada señal visible de conflicto, compatibilidad genérica en `SemillaP2PClient.patch()` y pruebas de convergencia sin depender de una base de datos central.

## 1.8.1 - 2026-07-29

- Agregada inspección de cuota y persistencia del almacenamiento local para advertir cuando IndexedDB puede ser desalojada o está cerca de agotarse.
- Incorporada solicitud explícita de almacenamiento persistente desde gestos del usuario, sin alterar el flujo de autenticación Google ni bloquear el uso cuando el navegador no concede la protección.
- Fortalecida la apertura de IndexedDB con cierre ante cambios de versión, detección de aperturas bloqueadas, recuperación del caché de conexión y errores de cuota normalizados.
- Añadidos estados accesibles de durabilidad, textos ES/EN/AR, huellas de release y pruebas de regresión para navegadores compatibles, no compatibles y con poco espacio.

## 1.8.0 - 2026-07-29

- Agregada identidad ECDH P-256 por instalación con clave privada no extraíble y claves AES-GCM de 256 bits por proyecto, envueltas en reposo mediante una clave local no extraíble.
- Incorporados sobres de clave individuales con HKDF/AES-GCM, solicitud automática al aceptar invitaciones, recuperación de ciphertext recibido antes de la clave y rotación después de revocar participantes.
- Cifradas operaciones y snapshots antes de SSE/POST; el backend y el cliente rechazan texto plano en espacios nuevos con `encryptionVersion: 1`.
- Agregado el bloque reutilizable `P2P_CIFRADOx`, registro seguro de claves públicas y pruebas reales de ECDH, AES-GCM, alteración, snapshot, autorización y purga criptográfica.
- Conservada compatibilidad explícita con espacios heredados sin forzar una migración destructiva de datos existentes.

## 1.7.0 - 2026-07-29

- Reemplazada la nota genérica por un panel administrativo compacto para proyectos, compras, ingresos y proyecciones, con métricas de capital disponible, gasto real, pendiente proyectado y variación proyectado/real.
- Agregada creación autónoma e idempotente de espacios antes de invitar, con reintento seguro que reutiliza el mismo espacio y evita duplicados durante fallos parciales.
- Incorporada edición y eliminación de movimientos, enlace de una compra real con su proyección y cálculo derivado del contraste presupuestado frente a ejecutado.
- Ampliados y aplicados en backend los permisos `read`, `add`, `delete` y `projection`; se conserva `write` como compatibilidad heredada.
- Actualizados textos ES/EN/AR, precache, release y pruebas de dominio, PWA y núcleo P2P.

## 1.6.11 - 2026-07-29

- Aisladas todas las operaciones asíncronas del cliente mediante una identidad inmutable de sesión por `userId`, `deviceId` y generación.
- Las respuestas tardías de bootstrap, invitaciones, publicaciones, outbox, snapshots y Web Push se descartan antes de modificar IndexedDB o el estado de otra cuenta.
- Serializada la aplicación de bootstrap para que solo la solicitud más reciente de la sesión se consolide; el cierre espera las escrituras ya iniciadas antes de liberar el almacenamiento local.
- Los tokens y callbacks SSE, ACK, reconexión y recuperación quedan ligados a su cuenta de origen; se agregaron pruebas para cambio de cuenta durante una apertura realtime pendiente.

## 1.6.10 - 2026-07-28

- Agregado el ciclo reutilizable de revocación, transferencia atómica de propiedad y abandono mediante `P2P_ACCESOSx`, con permisos del propietario y eventos de membresía.
- Corregida la lectura local permisiva de espacios ausentes: `getEntity` y `listEntities` requieren membresía `read` vigente.
- Bootstrap y eventos de revocación purgan atómicamente espacios, entidades, outbox, snapshots, revisiones y watermarks; la migración detecta también residuos huérfanos sin metadato de espacio.
- Ampliadas las pruebas frontend, backend y HTTP para revocación, abandono, autorización posterior y limpieza determinista.

## 1.6.9 - 2026-07-28

- Corregido el punto débil de `custom()`: sus operaciones dejan de ser eventos efímeros y pasan a formar parte del estado durable del espacio.
- Cada operación `custom` recibe una identidad reconstruible, incrementa `stateRevision`, usa outbox/confirmación ordenada y queda incluida en snapshots completos.
- Los snapshots conservan `operationType`, por lo que una réplica nueva puede restaurar registros genéricos o bitácoras CRDT sin perderlos al vencer la cola temporal.
- Ampliadas las pruebas frontend y backend para identidad automática, límite de tamaño, reversión optimista, replay y reconstrucción de datos `custom`.

## 1.6.8 - 2026-07-28

- Persistido un watermark de recuperación por espacio para que una operación nueva no pueda ocultar operaciones antiguas perdidas tras un salto de la cola temporal.
- `p2p_gap` fuerza recuperación de todos los espacios legibles y el estado pendiente solo se resuelve con un `snapshot.complete` íntegro que cubra la revisión requerida.
- Una réplica incompleta deja de ser elegible como fuente; cliente y backend exigen que `sourceStateRevision` coincida exactamente con la revisión autorizada en la concesión.
- Ampliadas las pruebas de regresión del estado local, continuidad PWA y grants de snapshot atrasados o adelantados.

## 1.6.7 - 2026-07-28

- Corregida la reconciliación de snapshots completos para retirar entidades canónicas ausentes en la réplica fuente y evitar datos fantasma entre dispositivos.
- Las operaciones locales pendientes se conservan sobre una base canónica vacía, mientras que una copia atrasada no puede eliminar entidades locales con revisión posterior.
- Los fragmentos y el cierre deben declarar la misma `sourceStateRevision`, usar identidades únicas y no contener entidades posteriores a esa revisión.
- La revisión local del espacio se reemplaza por el resultado autoritativo del snapshot, incluso si la copia está vacía; ampliadas las pruebas de regresión frontend y backend.

## 1.6.6 - 2026-07-28

- Separada la base confirmada de cada entidad y sus operaciones optimistas pendientes para impedir que una edición offline rechazada contamine el estado canónico.
- Las confirmaciones rebasan las capas pendientes sobre la última base autorizada; los rechazos permanentes revierten únicamente su operación y restauran el valor confirmado.
- El guardado de entidad optimista + outbox y la reversión + eliminación del outbox se ejecutan de forma atómica en IndexedDB.
- Las operaciones de entidad del dispositivo emisor también regresan por su cola privada SSE: la respuesta HTTP ya no puede adelantarse a operaciones remotas previamente secuenciadas y todas las réplicas consolidan el mismo orden canónico.
- Los errores temporales o de sesión (`401`, `408`, `425`, `429`, `5xx`) conservan el outbox para reintento; se agregaron pruebas de regresión para cadenas de operaciones aceptadas/rechazadas.

## 1.6.5 - 2026-07-27

- Detectado el salto entre el cursor local y la primera `deviceSequence` todavía disponible cuando la cola temporal venció, fue recortada o ya no conserva el tramo solicitado.
- El stream SSE emite `p2p_gap`, evita entregar una historia parcial como si fuera continua y revalida cada página para cubrir recortes concurrentes.
- El cliente fuerza bootstrap antes de procesar eventos posteriores; confirma el salto solo si el estado local está al día y, si falta estado funcional, mantiene la recuperación por snapshot.
- Ampliadas las pruebas backend y PWA para colas truncadas, colas vacías con secuencia previa y ACK suspendido durante reconstrucción.

## 1.6.4 - 2026-07-20

- Impedido que una réplica sirva snapshots mientras el espacio tenga operaciones en outbox o entidades locales todavía `optimistic`.
- El cliente intenta confirmar primero las operaciones pendientes y difiere la copia si aún no existe una revisión canónica segura.
- El arranque y la recuperación online vacían el outbox antes de abrir el stream, evitando que una solicitud en cola observe estado local no confirmado.
- Una operación confirmada se materializa en IndexedDB antes de retirarse del outbox, cerrando la ventana de carrera entre confirmación y snapshot.
- Ampliada la prueba dinámica para comprobar que los cambios optimistas no se publican y que una réplica confirmada sí genera el snapshot completo.

## 1.6.1 - 2026-07-20

- Corregido el replay SSE para recorrer toda la cola aunque supere el límite de una página.
- Los eventos en vivo que llegan durante el replay quedan temporalmente en búfer y se liberan después en orden ascendente, sin duplicados.
- El cliente aplica eventos mediante una tubería secuencial, mantiene cursor monótono y no adelanta ACK cuando una escritura local falla.
- La copia inicial puede solicitarse a varias réplicas para reducir dependencia de un único dispositivo desactualizado o desconectado.
- Ampliadas las pruebas de regresión para replay paginado, evento en vivo concurrente, orden estricto y múltiples fuentes de snapshot.

## 1.6.0 - 2026-07-20

- Incorporada base P2P local-first genérica con IndexedDB aislada por cuenta, outbox offline, SSE + POST, replay, ACK y snapshot inicial entre dispositivos.
- Agregadas invitaciones por correo, espacios con permisos, registro limitado de dispositivos y notificaciones Web Push reutilizando la estructura de `otro_proyecto`.
- La PWA puede reabrir la copia local con una sesión previa aunque memoriaBACKEND esté temporalmente inaccesible y sincroniza al reconectar.
- Añadida interfaz funcional de demostración para invitar, aceptar y editar una nota compartida sin acoplar la semilla a una app específica.
- Reforzadas idempotencia por espacio/dispositivo, aceptación concurrente de invitaciones, tokens realtime breves y pruebas backend/PWA de regresión.

## 1.5.0 - 2026-07-20

- Agregado acceso con Google antes de mostrar “Hola mundo”, usando el mismo flujo Firebase Authentication → Firebase Admin → sesión Redis de `otro_proyecto`.
- Incorporados módulos frontend separados para API, configuración pública de Render y autenticación Firebase.
- Integrado memoriaBACKEND reutilizable con CORS por allowlist, rate limit, perfiles persistentes, sesiones deslizantes, cierre de sesión y validación de configuración al arrancar.
- Añadida inyección de `APP_BACKEND_URL` durante el build del Static Site sin exponer secretos.
- Reforzados CSP, COOP para popups de Google, traducciones ES/EN/AR, release, precache y pruebas de regresión.

## 1.4.0 - 2026-07-02

- Agregado `src/js/skeleton-screen.js` como infraestructura reutilizable para esperas superiores a 500 ms.
- Integrado skeletonscreen en carga inicial/cambio de idioma y carga del logo opcional, sin cambiar la interfaz mínima “Hola mundo”.
- Documentada la regla obligatoria para IA y futuros módulos: usar skeletonscreen en cargas perceptibles y no spinners como patrón principal.
- Sincronizados release, precache, Service Worker, configuración y smoke test para validar esta nueva capa.

## 1.3.9 - 2026-07-02

- Agregado árabe en `textX/app/ar.json` y `textX/seo/ar.json` con `dir: rtl`.
- Sincronizadas huellas, precache, manifiesto de idiomas y verificación directa para ES/AR/EN.
- Reforzado CSS RTL para que la semilla valide orientación de lectura derecha a izquierda sin romper mobile-first.

## 1.3.7 - 2026-07-02

- Reforzado el punto débil de hostings estáticos con rewrite SPA: si un PNG opcional inexistente devuelve `index.html` con estado 200, el Service Worker ya no lo cachea como logo/ícono.
- El precache, la precarga de assets del release y la estrategia network-first de imágenes opcionales ahora aceptan solo respuestas de imagen reales u octet-stream seguro; ante HTML, error o ausencia generan el fallback geométrico.
- Ampliado el smoke test para validar que `sw.js` rechaza respuestas `text/html` en rutas de logo/íconos opcionales.

## 1.3.6 - 2026-07-02

- Reforzado el punto débil de caché de logos e íconos opcionales: el Service Worker ahora guarda estos assets con una clave canónica sin query string.
- Las cargas con cache-busting del logo pueden reutilizar el PNG real ya guardado cuando la app está offline, en lugar de volver al fallback geométrico.
- El fallback geométrico sigue funcionando cuando no existe imagen real, pero deja de generar entradas duplicadas por cada hidratación o cambio de idioma.
- Ampliado el smoke test para validar que la caché de imágenes opcionales usa coincidencia sin query y reemplazo seguro por el asset real.

## 1.3.4 - 2026-07-02

- Reforzado `manifest.webmanifest` con íconos geométricos embebidos como `data:image/svg+xml` para mantener instalabilidad aunque los PNG reales todavía no existan.
- Conservadas las rutas PNG reales en el manifest para que, cuando se agreguen o cambien los íconos en `assets/icons`, la app instalada pueda actualizar el logo/ícono desde el static site.
- Ampliado el smoke test para validar fallbacks instalables del manifest además del fallback visual y del Service Worker.

## 1.3.1 - 2026-07-02

- Reforzado fallback geométrico de logo e íconos PNG desde el Service Worker sin crear imágenes reales.
- La verificación directa de huellas ahora soporta archivos binarios y assets opcionales ausentes.
- Agregada vigilancia sin polling para detectar cuando aparece o cambia `assets/icons/logo.png` y los íconos instalables.
- Ampliado smoke test para cubrir fallback de imágenes y detección de cambios en assets opcionales.

## 1.3.0 - 2026-07-02

- Eliminado polling de actualización por intervalo en el cliente.
- Verificación ahora basada en eventos de ciclo de vida y eventos del Service Worker.
- Agregado sistema multilenguaje `textX/app` y `textX/seo` con español, inglés y árabe RTL.
- Agregado manifiesto `textX/languages.json` generado automáticamente desde los JSON disponibles.
- Agregado loader de idioma y selector autodetectable sin hardcodear idiomas en la UI.
- Agregado fallback geométrico para logo cuando no existe el PNG y prompts `.txt` para imágenes esperadas.
- Script de release actualizado para regenerar idiomas y huellas.

## 1.2.0 - 2026-07-02

- Mejora de escala: verificación principal por un solo `version.json` con huellas SHA-256.
- Coordinación multi-pestaña para evitar consultas duplicadas.
- Fallback de huellas directas más espaciado.
- Service Worker con navigation preload y precache configurable desde metadata.
- Corrección de abort duplicado en solicitudes con timeout.
- Dockerfile, Nginx, Docker Compose y Kubernetes opcionales.
- Script `tools/generate-release.py` para generar releases robustos.
- Smoke test local para validar PWA, manifest, headers y huellas.

## 1.1.0 - 2026-07-02

- Doble detección por `version.json` y huellas directas.
- Cache versionada y limpieza automática.
- Headers para hostings estáticos.
