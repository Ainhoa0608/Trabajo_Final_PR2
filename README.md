# Trabajo Final PR2 — Smart Chocolate Factory

Proyecto de automatización e integración para la fábrica de bombones **Chocolat Suprême**, que combina una página web de gestión de pedidos, una base de datos PostgreSQL, puentes MQTT desarrollados en Python, simulación industrial en RoboDK y un sistema de seguridad basado en ESP32.

## Integrantes

* Valentina Monteserín
* Claudia Castillo
* Ainhoa García Herrera
* Rihab Baitar

---

## Descripción del proyecto

El objetivo del proyecto es desarrollar una solución integral para la automatización del proceso de empaquetado y paletizado de una fábrica de bombones. El sistema integra una interfaz web para la gestión de pedidos, una base de datos PostgreSQL para el almacenamiento de la información, comunicación mediante MQTT, simulación industrial en RoboDK y un sistema de seguridad basado en sensores conectados a un ESP32.

La arquitectura permite que un pedido realizado desde la página web sea almacenado en la base de datos, procesado por los puentes MQTT y ejecutado posteriormente en la planta simulada de RoboDK. De forma paralela, se dispone de una segunda planta destinada a la demostración de funciones de seguridad industrial, incluyendo ralentización por proximidad, parada de emergencia e interrupción de procesos.

---

## Estructura del repositorio

| Archivo / Carpeta                   | Descripción                                           |
| ----------------------------------- | ----------------------------------------------------- |
| `PR2_trabajo_final_memoria (1).pdf` | Memoria completa del proyecto                         |
| `Entrega_final.zip`                 | Código fuente, scripts, web, base de datos y firmware |
| `Simulacion_Secuencias_RK.rdk`      | Proyecto RoboDK utilizado para la simulación          |
| `VIDEO-SIMULACION-SECUENCIA...`     | Vídeo demostrativo                                    |
| `pag/`                              | Página web                                            |
| `sql/`                              | Scripts de base de datos PostgreSQL                   |
| `Arduino_ESP32/`                    | Código del ESP32                                      |
| `Planta_Robodk/`                    | Proyecto RoboDK y scripts asociados                   |

---

## Puesta en marcha

### 1. Leer la memoria

Antes de ejecutar el proyecto se recomienda consultar el documento:

```text
PR2_trabajo_final_memoria (1).pdf
```

donde se describe la arquitectura, el diseño y el funcionamiento completo del sistema.

### 2. Descomprimir la entrega

Extraer el contenido de:

```text
Entrega_final.zip
```

en una carpeta local.

### 3. Instalar dependencias Python

```bash
python -m pip install -r requirements.txt
```

### 4. Configurar el archivo `.env`

Crear una copia de la plantilla:

```cmd
copy .env.example .env
```

o

```powershell
Copy-Item .env.example .env
```

y completar las credenciales necesarias para PostgreSQL, EMQX y el broker MQTT de la UPV.

### 5. Configurar PostgreSQL

Crear la base de datos:

```sql
CREATE DATABASE "PLanta_PR2";
```

y ejecutar los scripts incluidos en la carpeta `sql`.

### 6. Verificar la instalación

```bash
python diagnostico.py
```

### 7. Ejecutar los puentes MQTT

Terminal 1:

```bash
python mqtt_bridge.py
```

Terminal 2:

```bash
python mqtt_station_relay.py
```

Terminal 3:

```bash
python mqtt_industrial_bridge.py
```

### 8. Ejecutar la página web

Abrir el archivo:

```text
pag/FABRICA DE BOMBONES.html
```

en un navegador compatible.

### 9. Ejecutar RoboDK

Abrir el proyecto `.rdk` incluido y ejecutar:

```text
MQTT_listener.py
```

mediante la tecla F5.

---

## Arquitectura general

```text
Web
 │
 ▼
MQTT (EMQX)
 │
 ▼
mqtt_bridge.py
 │
 ├── PostgreSQL
 │
 └── mqtt_station_relay.py
         │
         ▼
      Broker UPV
         │
         ▼
       RoboDK


ESP32
 │
 ▼
MQTT (EMQX)
 │
 ▼
mqtt_industrial_bridge.py
 │
 ▼
Broker UPV
 │
 ▼
RoboDK
```

---

## Solución de problemas

| Problema                 | Posible causa                                |
| ------------------------ | -------------------------------------------- |
| Python no reconocido     | Python no está en el PATH                    |
| PostgreSQL no conecta    | Credenciales incorrectas o servicio detenido |
| MQTT no conecta          | Error en usuario, contraseña o conexión      |
| La web no guarda pedidos | `mqtt_bridge.py` no está en ejecución        |
| RoboDK no responde       | Relays o broker MQTT no disponibles          |
| ESP32 no conecta         | Configuración incorrecta de WiFi o MQTT      |

También puede ejecutarse:

```bash
python diagnostico.py
```

para verificar la configuración del entorno.

---

## Licencia y uso

Proyecto desarrollado con fines académicos para la asignatura PR2 del Grado en Informática Industrial y Robótica de la Universitat Politècnica de València (UPV).
