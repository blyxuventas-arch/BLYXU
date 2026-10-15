# BLYXU: sesión compartida de registro (PC y celular)

## Uso

1. Inicia sesión con la misma cuenta administradora en ambos equipos.
2. En el PC, abre la creación o edición de productos y despliega **Escáner compartido · PC + celular**.
3. Pulsa **Vincular celular a este PC**. Selecciona el campo de código que recibirá las lecturas.
4. En el celular, abre el mismo administrador y pulsa **Leer QR de vinculación**. Usa el escáner existente para leer el QR del PC.
5. Pulsa **Escanear para el PC**. La cámara sigue leyendo códigos y espera la confirmación del PC antes de continuar.
6. Continúa completando los datos y guarda únicamente desde el PC. Al cambiar de producto se renueva la identidad del formulario y el teléfono muestra la referencia nueva.
7. Usa **Desconectar** para terminar. La vinculación vence a los 30 minutos.

No transmite video entre equipos, no comparte otros campos y no guarda productos automáticamente.

## Diseño y seguridad

- Proyecto exclusivo de BLYXU: cufptttzflkdwizpqaot. Dominio: blyxu.online.
- Se reutiliza openBarcodeScanner; las llamadas normales conservan sus valores predeterminados. El QR de vinculación habilita preserveRawValue para conservar el enlace completo.
- Cada pestaña y dispositivo tiene un UUID nuevo en memoria; cada formulario y destino tiene identidad y época independientes.
- El servidor vuelve a comprobar la sesión administrativa existente en cada operación y exige el mismo correo propietario.
- La vinculación usa secretos aleatorios de 192 bits. Los tokens de PC, celular y vinculación se almacenan como hashes, dentro de la caché privada existente con expiración.
- Los enlaces llevan el secreto en el fragmento y lo eliminan del historial al vincularse.
- Solo el servidor autorizado se suscribe a canales privados de Supabase Realtime. Entrega eventos a cada navegador mediante POST autenticado y streaming SSE. Ninguna clave de servicio ni canal privado se publica al navegador.
- No se crean tablas públicas ni políticas amplias para anon/authenticated. Se mantiene la autorización existente del servidor y su transacción con revisión.
- El destino se valida por sesión, pestaña, formulario, campo, época y secuencia. Los duplicados se confirman sin volver a aplicarse.
- Solo hay una lectura pendiente. El cambio de formulario rechaza la lectura pendiente anterior y devuelve su confirmación negativa.
- Se rechazan lecturas si el PC no está listo, el campo no está visible, la referencia cambió o la sesión venció. El flujo Realtime también se corta al expirar la vinculación.
- La sesión puede recuperarse de una desconexión de transporte; se conservan los controles de validación y la confirmación de recepción.
- Las sesiones cerradas o vencidas no se reutilizan. No se guardan los tokens en localStorage.

## Archivos

Frontend: administrativo.html, admin-app.js, admin-shared-scan.js y admin-shared-scan.css.

Servidor canónico: supabase/functions/blyxu-api/index.ts y sus módulos server.js, controller.js, drive-connection.js, category-batch.js y shared-scan.js. La dependencia de Realtime está fijada a @supabase/realtime-js@2.117.3.

No desplegar copias antiguas o paquetes previos de .supabase-migration-private. Desplegar desde el index.ts canónico y sus módulos.

## Validación

Pruebas de servidor, permisos, caducidad, conflictos, duplicados, rutas autenticadas y regresiones:

    node --test tests/shared-scan.test.mjs tests/shared-scan-scanner.test.mjs tests/supabase-server.test.mjs tests/drive-connect-admin.test.mjs

Prueba con navegadores independientes y transporte simulado (requiere Playwright instalado; permite BLYXU_PLAYWRIGHT_MODULE para usar un runtime local):

    node tests/shared-scan-browser.mjs

La prueba de navegador verifica lecturas consecutivas, datos del formulario intactos, aislamiento de una segunda pestaña, cambio de formulario, destinos de variantes y desconexión. La cámara física y Supabase Realtime real requieren validación final en el proyecto desplegado.

## Publicación pendiente de acceso

El conector Supabase consultado no tiene acceso a cufptttzflkdwizpqaot y la conexión GitHub disponible tiene permiso pull pero no push en blyxuventas-arch/BLYXU. No se ha modificado producción.

Conectar las cuentas autorizadas, desplegar la función blyxu-api desde los archivos canónicos manteniendo su configuración de autenticación existente, y publicar los cuatro archivos frontend de forma coordinada. Comprobar primero un flujo Realtime privado real y la denegación sin sesión; después repetir la vinculación con PC y celular autenticados.

No migrar ni modificar el proyecto de Original Store. No subir archivos *private*, credenciales, snapshots, cachés o fixtures a GitHub Pages.
