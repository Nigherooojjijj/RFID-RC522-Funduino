# RFID-RC522-Funduino
# MakeCode Package for the Joy-IT SBC-RFID-RC522 RFID module (MFRC522)

This library provides a Microsoft MakeCode package for the Joy-IT SBC-RFID-RC522 RFID module. See [Joy-IT SBC-RFID-RC522](https://joy-it.net/products/SBC-RFID-RC522) for more details.

## Connection

The RFID module needs to be connected with six pins to the Micro:bit:

| RFID module | Calliope  |
|-------------|-----------|
| VCC         | 3V        |
| GND         | GND       |
| MISO        | P15       |
| MOSI        | P14       |
| SCK         | P13       |
| NSS         | P03       |
| RST         | C4       |
## Initialize RFID module

The RFID module needs to be initialized before it is ready to use. All necessary commands will be transferred via SPI here.

```typescript
// Initialize RFID module
MFRC522.Init()
// Read unique ID
MFRC522.getID()
// Read data
MFRC522.read()
// Write data
MFRC522.write("1234")
// Turn antenna off
MFRC522.AntennaOff()
