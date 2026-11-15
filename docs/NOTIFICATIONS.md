# Notificaciones

Las notificaciones push se envían desde la API mediante Expo Push Service. La API decide
cuándo y a quién avisar; el módulo de notificaciones guarda los tokens de los dispositivos y
se encarga del transporte. No hace falta un middleware HTTP: los servicios de reservas y
administración llaman a `Avisos` después de confirmar sus cambios en la base.

## Avisos enviados por la API

- Si un bloqueo cancela una reserva confirmada, se avisa a su dueño e incluye el motivo.
- Si se cancela una reserva de un turno futuro, se avisa a quienes tienen ese espacio como
  favorito, excepto a quien canceló.
- Los recordatorios dos horas antes siguen siendo notificaciones locales del teléfono.

## Detección local de suspensiones

`GET /yo/reservas/cancelaciones-por-bloqueo` requiere sesión y devuelve una lista paginada
`{ reservaId, motivo }` de las reservas propias canceladas por bloqueos. El motivo se guarda
junto con la cancelación en la misma transacción y permanece aunque se elimine el bloqueo.
El parámetro opcional `reservaId` filtra la lista por una reserva.
El contrato de `GET /yo/reservas` no cambia. Las cancelaciones anteriores a esta función no
tienen motivo retroactivo y no se pueden identificar con certeza.

La columna nueva requiere actualizar el esquema de la base al desplegar la API; verificar la
configuración de sincronización y hacer una copia de seguridad antes de aplicarlo. La app
compara las reservas con su estado anterior y consulta este endpoint sólo ante transiciones
de activa a cancelada.

Los envíos son asíncronos: un problema de Expo se registra en el log y no deshace la reserva ni
el bloqueo. Si Expo indica `DeviceNotRegistered`, el token se elimina para no volver a enviar
al dispositivo inválido.

## Registro de dispositivos

Con una sesión iniciada, la app solicita permiso para notificaciones, obtiene su Expo Push
Token y lo registra con `POST /dispositivos`:

```json
{
  "tokenExpo": "ExponentPushToken[...]",
  "plataforma": "android"
}
```

La operación es idempotente por token. Si el mismo token se registra desde otra cuenta, queda
asociado a la cuenta actual. Un usuario puede tener más de un dispositivo. Al cerrar sesión,
la app intenta dar de baja el token con `DELETE /dispositivos/<tokenExpo>`.

`POST /dispositivos/prueba` manda una push a todos los dispositivos anotados para la sesión
actual y responde cuántos están registrados. Los tres endpoints requieren autenticación.

## Configuración

Para enviar notificaciones reales, configurar en el entorno de la API:

```env
NOTIFICACIONES=expo
# Opcional; ésta es la URL predeterminada:
# EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send
```

Con `NOTIFICACIONES=registro` (valor predeterminado) la API sólo registra el intento en sus
logs y no contacta a Expo. No se guarda ninguna credencial de Expo en la app.

El proyecto Expo debe tener configuradas las credenciales de plataforma en EAS: FCM para
Android y APNs para iOS. Para producción, usar builds nativos y dispositivos reales; Expo Go
no es una vía fiable para validar push remotas en todas las versiones y plataformas. No hace
falta integrar el SDK de Firebase en la app para que la API envíe mediante Expo Push Service.

## Pruebas

```bash
pnpm test:notificaciones
```

La suite usa una API local falsa de Expo y no envía notificaciones a internet. Para probar con
un teléfono, iniciar la API con `NOTIFICACIONES=expo`, iniciar sesión desde un build nativo y
usar `POST /dispositivos/prueba`. Después probar el flujo de bloquear una reserva y cancelar
una reserva de un espacio favorito.

Más información:

- [Enviar notificaciones con Expo](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Configurar push en Expo](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Errores de Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/#errors)
