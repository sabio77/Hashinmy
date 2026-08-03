# Limitaciones reales de una PWA autoactualizable

## El plano de control también necesita recuperación

La información funcional no depende de Redis, pero membresías, revocaciones y permisos sí forman parte del plano de control. Si ese plano pierde estado, la PWA conserva las copias locales y las deja en solo lectura; no puede reautorizar por sí sola una membresía porque hacerlo permitiría recuperar acceso después de una revocación legítima. La restauración correcta consiste en recuperar el plano de control o volver a invitar la cuenta desde un miembro autorizado.

Las constancias explícitas de revocación tienen retención y cantidad acotadas. Un dispositivo que permanezca desconectado más allá de esa retención puede conservar una copia histórica, algo que ninguna PWA puede borrar remotamente. Al reconectar sin autorización confirmada no podrá sincronizar ni modificar datos compartidos.

Esta semilla está diseñada para actualizar lo más rápido posible, pero hay límites reales que ninguna PWA puede eliminar por completo.


## Carpetas del mismo dominio no son fronteras de seguridad del navegador

`hashinmy.com/contabilidad` y `hashinmy.com/facturacion` comparten el mismo origen web. La semilla separa identificadores, IndexedDB, claves lógicas, canales, cachés, sesiones del backend y tráfico del Service Worker para evitar mezcla accidental, pero JavaScript hostil publicado en una carpeta del mismo origen pertenece a la misma frontera de seguridad del navegador y podría intentar acceder a recursos del origen.

Para aislamiento frente a código no confiable, cada aplicación debe usar un subdominio u origen distinto. El soporte por carpetas garantiza independencia operativa entre aplicaciones confiables administradas por el mismo propietario; no debe presentarse como sandbox de seguridad entre terceros.

## Red local sin backend: límite de señalización del navegador

El bloque opcional `P2P_sin_RED_LOCALx` usa `RTCPeerConnection` con `iceServers: []`, por lo que intenta rutas directas disponibles en la misma red y no depende de STUN/TURN. Sin embargo, WebRTC no define cómo dos navegadores se descubren ni cómo intercambian la oferta, la respuesta y los candidatos ICE. Una PWA estática tampoco puede abrir un servidor TCP/UDP, anunciarse por mDNS como servicio propio ni enviar Web Push cuando no existe conectividad con el proveedor.

Por esa razón, `sinBACKEND=true` puede activar automáticamente un canal local que ya esté abierto, pero el primer enlace —y cualquier renegociación después de cerrar por completo las apps— requiere intercambiar los códigos mostrados por la interfaz. Ambos dispositivos deben mantener la PWA abierta durante el emparejamiento. El canal directo sincroniza operaciones de proyectos cuya membresía y permisos ya fueron confirmados anteriormente y compara revisiones firmadas al reconectarse. Si un dispositivo quedó atrasado cuando el outbox del otro ya estaba vacío, puede reconstruirse por un snapshot local cifrado y firmado; entre cuentas, solo una réplica vigente del propietario puede ser fuente, mientras que dos instalaciones de la misma cuenta pueden recuperarse entre sí. Crear cuentas, invitar un correo nuevo, aceptar una membresía no conocida o validar una revocación sigue necesitando memoriaBACKEND.

La identidad visible del código de emparejamiento ya no constituye autorización. Antes de quedar offline, memoriaBACKEND emite una capacidad temporal ES256 que vincula origen, aplicación, cuenta, dispositivo, clave pública, proyectos y permisos. Cada operación LAN se firma además con una clave ECDSA P-256 no extraíble de esa instalación; el receptor valida ambas firmas y contrasta los permisos certificados con su estado local confirmado. Un colaborador no puede declararse propietario ni reutilizar una capacidad desde otra aplicación o dispositivo.

La limitación inevitable es la frescura: dos equipos completamente offline no pueden conocer una revocación ocurrida después de su último contacto con memoriaBACKEND. La semilla reduce esa ventana con capacidades vencibles —siete días por defecto, configurable hasta treinta— y con el estado de membresía ya conocido por el receptor. Para una revocación inmediata, al menos uno de los dispositivos debe recuperar conectividad con el plano de control.

Mientras la PWA sigue online, la pestaña líder renueva esa capacidad antes de su vencimiento mediante un temporizador único calculado desde la vigencia firmada. Esto evita que una app abierta durante días descubra la expiración justo después de perder Internet. La renovación no elimina el límite de seguridad: si todos los dispositivos permanecen offline más allá del TTL, deben recuperar conectividad con memoriaBACKEND antes de volver a aceptar operaciones locales.

La autoridad de esas capacidades también necesita una rotación escalonada. memoriaBACKEND puede anunciar un anillo acotado de claves públicas de verificación: primero debe preanunciarse la nueva pública, luego cambiarse la pareja firmante conservando la anterior y finalmente retirarse la antigua después del TTL máximo. Una instalación que permanezca offline durante todo el preanuncio no puede aprender una clave futura y deberá reconectarse antes de aceptar capacidades emitidas únicamente por esa autoridad nueva.

Cuando memoriaBACKEND regresa, el outbox no vuelve a firmar el cambio como si perteneciera al dispositivo receptor. Conserva el sobre original y retransmite una operación por `/api/p2p/events/relay-local` o un lote relacionado por `/api/p2p/events/relay-local-batch`; el backend revalida la capacidad todavía vigente, cada firma, el orden completo y la unicidad, exige que el mensajero todavía tenga acceso y secuencia el cambio con la cuenta y el dispositivo que realmente lo crearon. Los lotes —por ejemplo, una compra y el vínculo que liquida una proyección— se transmiten, guardan y confirman como una sola unidad: si una operación falla, ninguna parte del lote queda aceptada. La respuesta incluye los eventos canónicos para cerrar la capa optimista aunque el mismo `operationId` ya hubiese sido confirmado por otra réplica. Un rechazo permanente —incluida una capacidad vencida o la eliminación del bloque opcional— revierte localmente solo esa operación o lote y permite continuar con el outbox normal; una caída temporal conserva el relevo para reintento. El modo local es un transporte de continuidad, no un sustituto del plano de control.

## El navegador controla parte del ciclo

El navegador decide cuándo revisa el Service Worker y puede aplicar políticas internas para evitar abuso de red.

## El CDN puede romper la actualización

Si el CDN cachea `sw.js`, `index.html` o `version.json` durante mucho tiempo, la app instalada no podrá ver los cambios de inmediato.

## La app abierta necesita recargar

JavaScript y CSS ya cargados en memoria no cambian mágicamente. La semilla detecta cambios y recarga la app para aplicar los archivos nuevos.

## Cambios sin señal

Si modificas archivos que no están en `fingerprintCheckFiles` y tampoco actualizas `version.json`, una app abierta podría no enterarse hasta una recarga manual o una navegación nueva.

## La recuperación entre cuentas depende del propietario

Sin una base de datos funcional central, memoriaBACKEND no puede comparar un snapshot cifrado contra una copia autoritativa. Todos los participantes legítimos conocen la clave del espacio y una instalación manipulada podría cifrar datos locales alterados. Para evitar que un colaborador convierta esa copia en el estado de otra cuenta, la semilla acepta snapshots entre cuentas únicamente desde dispositivos vigentes del propietario.

Los dispositivos de una misma cuenta pueden reconstruirse entre sí con permiso `read`. Un invitado nuevo o un participante que perdió todas sus copias locales deberá coincidir al menos una vez con un dispositivo del propietario conectado. Si el propietario perdió todas sus réplicas, ningún backend sin almacenamiento funcional puede reconstruir el contenido ausente.

## El almacenamiento local no es una copia infalible

La información canónica vive en IndexedDB. La semilla solicita almacenamiento persistente y vigila cuota/uso, pero el navegador puede negar esa protección, aplicar políticas propias o perder datos por borrado manual, restablecimiento del dispositivo o daño físico. Una arquitectura sin base de datos central debe conservar al menos otra réplica íntegra y sincronizada; ninguna API del navegador puede reconstruir datos ausentes de todos los dispositivos.

## La revocación criptográfica no borra el pasado

La época autoritativa impide que una clave anterior vuelva a convertirse en la clave activa y el backend excluye inmediatamente al miembro revocado de nuevas entregas. Además, el proyecto queda bloqueado para nuevas operaciones y snapshots hasta que el propietario active una clave distinta, evitando que una falla intermedia permita seguir protegiendo contenido futuro con el secreto conocido por el participante retirado. Sin embargo, un dispositivo desconectado conserva los datos y claves que obtuvo legítimamente antes de la baja. Al volver a conectarse deja de recibir contenido futuro y purga el espacio, pero ninguna PWA puede borrar a distancia una copia offline ni hacer que información ya descifrada deje de haber sido conocida.

Un proyecto heredado creado antes de la autoridad de claves necesita que su propietario lo abra una vez para confirmar la clave inicial. La interfaz bloquea invitaciones adicionales desde otros participantes durante esa transición, evitando incorporar un dispositivo al que no se le podría entregar una clave vigente.

Una operación pendiente conserva temporalmente su versión no cifrada solo en la IndexedDB de la cuenta para poder recifrarla si la autoridad cambia antes de publicarla. Esa copia nunca se envía a memoriaBACKEND y se elimina al confirmar o rechazar definitivamente la operación; comparte los mismos riesgos físicos y de almacenamiento local descritos arriba.

## Clonar un perfil de navegador no equivale a crear otro dispositivo

Una copia o restauración del almacenamiento del navegador puede duplicar el `deviceId`. Si la copia no conserva la misma clave privada no extraíble, la continuidad de clave detecta la colisión y la instalación restaurada recibe automáticamente una identidad nueva sin perder sus operaciones locales pendientes. Si una herramienta consigue clonar bit a bit tanto el identificador como la clave privada y todo el almacenamiento del origen, ambos entornos son criptográficamente indistinguibles hasta que uno cambie su estado; ninguna aplicación web puede demostrar por sí sola que son equipos físicos diferentes. Para migraciones controladas conviene usar la invitación o recuperación P2P normal en lugar de copiar perfiles completos del navegador.

## Qué significa una réplica confirmada

La señal de cobertura exige que la revisión esté aplicada en IndexedDB; no se deriva de conexión, Web Push, entrega SSE ni ACK de transporte. Aun así, es una declaración temporal del software cliente y no una prueba física de que el dispositivo seguirá existiendo. Si un equipo se destruye o su almacenamiento se borra mientras permanece desconectado, memoriaBACKEND solo podrá reflejar la pérdida cuando esa instalación vuelva a registrarse, cambie de identidad o el usuario retire el dispositivo. La protección real sigue requiriendo al menos dos copias íntegras y recientes.

## El cupo de dispositivos no sacrifica una réplica

Una instalación nueva no se admite automáticamente cuando la cuenta ya alcanzó `APP_P2P_MAX_DEVICES_PER_USER`. El backend limpia referencias realmente vencidas, pero si el cupo sigue ocupado responde `P2P_DEVICE_LIMIT_REACHED` sin desconectar ni eliminar dispositivos válidos. Para liberar una posición, el panel de dispositivos de la semilla permite retirar una instalación antigua desde otra instalación registrada de la misma cuenta y delega la operación en `window.SemillaP2P.retireDevice(deviceId)`.

La baja prepara el índice completo de espacios y los reportes temporales de las demás instalaciones. Redis vuelve a validar en el mismo commit el conjunto exacto de proyectos, los permisos de lectura y cada revisión autoritativa; así una invitación, cambio de permiso o publicación concurrente no puede dejar obsoleta la comprobación. Un cambio de alcance responde `P2P_DEVICE_RETIREMENT_SCOPE_CHANGED` y una copia atrasada responde `P2P_DEVICE_RETIREMENT_UNSAFE`, ambos sin modificar el estado. La identidad retirada conserva un tombstone con TTL y un índice acotado para impedir su reingreso silencioso sin convertir Redis en una base funcional.

Esta comprobación solo puede demostrar cambios ya publicados y aplicados. Una edición que permaneció exclusivamente en el outbox o IndexedDB del dispositivo que se desea retirar no es visible para el backend; la interfaz debe sincronizar ese equipo antes de darlo de baja cuando todavía sea accesible.

## Recomendación

Para producción, mantén siempre una señal de deploy:

```text
version.json
```

y, si usas bundler, agrega el archivo manifest del build a:

```text
fingerprintCheckFiles
```


## La eliminación no puede borrar un dispositivo que nunca vuelve a conectarse

La eliminación definitiva corta de inmediato la autorización y registra avisos recuperables, pero una PWA no puede ejecutar código en un dispositivo apagado o permanentemente offline. Esa instalación conserva físicamente su última copia y las claves que obtuvo legítimamente hasta volver a abrir la aplicación; al reconectar, el tombstone o `p2p.space.deleted` activa la purga local. La eliminación evita sincronización futura y libera el plano de control, pero no puede garantizar borrado remoto de hardware inaccesible.


## Transferir propiedad requiere una copia completa en la cuenta destino

La cuenta que recibirá la propiedad debe abrir el proyecto y completar su sincronización en al menos un dispositivo antes de la transferencia. Esta precondición evita que una cuenta sin datos pase a ser la única fuente autorizada para reconstruir otras cuentas. La señal usada es una confirmación temporal de revisión aplicada; reduce el riesgo de pérdida lógica, pero no puede demostrar que el hardware seguirá existiendo después del cambio.
