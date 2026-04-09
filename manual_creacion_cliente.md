# Manual de Usuario: Creación de Cliente

## 1. Acceder al Módulo de Clientes

1. Inicie sesión en el sistema con su cuenta de **Administrador** o **Asesor**.
2. En el menú lateral (sidebar), haga clic en la opción **"Clientes"**.
3. Se mostrará la pantalla principal de clientes, con dos pestañas: **Clientes** y **Grupos**.

> 📸 **IMAGEN 1**: Captura del sidebar con la opción "Clientes" señalada.

> 📸 **IMAGEN 2**: Captura de la pantalla principal de Clientes mostrando la lista de clientes y los botones superiores.

---

## 2. Abrir el Formulario de Nuevo Cliente

1. Asegúrese de estar en la pestaña **"Clientes"**.
2. En la parte superior derecha, haga clic en el botón **"+ Nuevo Cliente"**.
3. Se abrirá una ventana emergente (modal) con el formulario de creación.

> 📸 **IMAGEN 3**: Captura señalando el botón "+ Nuevo Cliente" en la esquina superior.

> 📸 **IMAGEN 4**: Captura del formulario de creación de cliente vacío (modal completo).

---

## 3. Completar los Datos del Cliente

El formulario contiene los siguientes campos que deben completarse:

### 3.1. Nombre y Apellido *(Obligatorios)*

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Nombre** | Primer nombre del cliente | Juan |
| **Apellido** | Apellido del cliente | Pérez |

- Ambos campos son **obligatorios**.
- Estos aparecen lado a lado en la primera fila del formulario.

> 📸 **IMAGEN 5**: Captura de los campos "Nombre" y "Apellido" llenados con datos de ejemplo.

---

### 3.2. Género *(Obligatorio)*

- Haga clic en el menú desplegable **"Seleccione género"**.
- Seleccione una de las dos opciones disponibles:
  - **Masculino**
  - **Femenino**
- Este campo es **obligatorio**. Si no lo selecciona, el sistema mostrará un mensaje de error al intentar guardar.

> 📸 **IMAGEN 6**: Captura del campo "Género" con el dropdown abierto mostrando las opciones "Masculino" y "Femenino".

---

### 3.3. Email *(Obligatorio)*

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Email** | Correo electrónico del cliente | cliente@ejemplo.com |

- Debe ser un correo electrónico válido.
- Este correo podrá usarse posteriormente para vincular al cliente con una cuenta de usuario en el sistema.

> 📸 **IMAGEN 7**: Captura del campo "Email" llenado con un correo de ejemplo.

---

### 3.4. Dirección *(Obligatorio)*

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Dirección** | Dirección del domicilio del cliente | 4ta Calle 5-20, Zona 1, Guatemala |

> 📸 **IMAGEN 8**: Captura del campo "Dirección" llenado con una dirección de ejemplo.

---

### 3.5. Teléfono y Teléfono de Emergencia

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Teléfono** | Número de teléfono principal del cliente | 5555-1234 |
| **Teléfono de Emergencia** | Número de un contacto de emergencia | 5555-5678 |

- Ambos campos incluyen un selector de código de país (por defecto **+502** para Guatemala).
- El formato del número puede ingresarse con o sin guiones.

> 📸 **IMAGEN 9**: Captura de los campos "Teléfono" y "Teléfono de Emergencia" llenados con números de ejemplo, mostrando el selector de código de país.

---

### 3.6. Asesor Asignado

Este campo funciona de manera diferente según su rol:

#### Si usted es **Administrador**:
- Verá un menú desplegable con la lista de todos los asesores y administradores registrados en el sistema.
- **Debe seleccionar un asesor** para asignar al cliente. Este campo es obligatorio.
- Si selecciona un usuario con rol de Administrador, verá una nota indicando: *"Está seleccionando un usuario con rol administrador como asesor"*.

> 📸 **IMAGEN 10**: Captura del dropdown de "Asesor Asignado" abierto, mostrando la lista de asesores disponibles (vista de Administrador).

#### Si usted es **Asesor**:
- Este campo aparecerá como **"Auto-asignado (Usted)"** y estará deshabilitado.
- Usted quedará asignado automáticamente como el asesor del cliente.

> 📸 **IMAGEN 11**: Captura del campo "Asesor Asignado" mostrando "Auto-asignado (Usted)" (vista de Asesor).

---

## 4. Guardar el Nuevo Cliente

1. Una vez completados todos los campos obligatorios, haga clic en el botón **"Crear Cliente"** ubicado en la parte inferior derecha del formulario.
2. Si hay campos vacíos o inválidos, el sistema le mostrará un mensaje de error indicando qué debe corregir.
3. Si todos los datos son correctos, el sistema mostrará una notificación verde de éxito: **"Cliente creado con éxito"**.
4. El modal se cerrará automáticamente y el nuevo cliente aparecerá en la lista de clientes.

> 📸 **IMAGEN 12**: Captura del formulario completamente llenado con todos los campos, listo para hacer clic en "Crear Cliente".

> 📸 **IMAGEN 13**: Captura de la notificación de éxito "Cliente creado con éxito" (toast verde).

> 📸 **IMAGEN 14**: Captura de la lista de clientes actualizada mostrando el nuevo cliente recién creado.

---

## 5. Cancelar la Creación

- Si desea cancelar la creación del cliente en cualquier momento, haga clic en el botón **"Cancelar"** o cierre el modal haciendo clic fuera de la ventana emergente o en la **"X"** de la esquina superior derecha.
- Los datos ingresados no se guardarán.

---

## 6. Resumen de Campos del Formulario

| # | Campo | Obligatorio | Tipo | Notas |
|---|-------|:-----------:|------|-------|
| 1 | Nombre | ✅ | Texto | Primer nombre del cliente |
| 2 | Apellido | ✅ | Texto | Apellido del cliente |
| 3 | Género | ✅ | Selector | Masculino / Femenino |
| 4 | Email | ✅ | Email | Correo electrónico válido |
| 5 | Dirección | ✅ | Texto | Dirección completa del domicilio |
| 6 | Teléfono | — | Teléfono | Con selector de código de país (+502) |
| 7 | Tel. Emergencia | — | Teléfono | Con selector de código de país (+502) |
| 8 | Asesor Asignado | ✅* | Selector | *Solo obligatorio para Administradores; auto-asignado para Asesores |

---

## 7. Posibles Errores y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| *"Todos los campos son obligatorios"* | Hay campos vacíos | Complete todos los campos marcados con * |
| *"Seleccione el género del cliente"* | No seleccionó género | Elija Masculino o Femenino |
| *"Debe asignar un asesor al cliente"* | Administrador no seleccionó asesor | Seleccione un asesor del dropdown |
| *"Error al crear el cliente"* | Error del servidor | Verifique su conexión y reintente |
| *"No se pudo conectar con el servidor"* | Sin conexión | Revise su conexión a internet |
