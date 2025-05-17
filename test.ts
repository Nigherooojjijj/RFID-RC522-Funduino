/**
 * test.ts - Testprogramm für die MFRC522-Erweiterung auf dem Calliope Mini
 */

// Initialisiere das RFID-Modul
MFRC522.Init();

// Versuche, die ID der RFID-Karte auszulesen
let id = MFRC522.getID();
serial.writeLine("RFID Card ID: " + id.toString());

// Versuche, die Daten von der Karte zu lesen
let data = MFRC522.read();
serial.writeLine("Data read: " + data);

// Schreibe den Text "1234" auf die Karte
MFRC522.write("1234");
serial.writeLine("Data '1234' written.");

// Schalte die Antenne aus
MFRC522.AntennaOff();
serial.writeLine("Antenna off.");

// Optionale Pause und Bildschirm löschen (wenn ein LED-Display vorhanden ist)
basic.pause(2000);
basic.clearScreen();
