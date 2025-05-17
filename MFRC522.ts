    /**
 * MFRC522 Block für den Calliope Mini V3
 * Verdrahtung:
 *   VCC  → VCC
 *   GND  → GND
 *   RST  → C4
 *   MISO → C15
 *   MOSI → C14
 *   SCK  → C13
 *   NSS  → P3
 */
//% color="#275C6B" weight=100 icon="\uf2bb" block="MFRC522 RFID"
namespace MFRC522 {
    // Variablen, Konstanten und Registeradressen
    let Type2 = 0
    const BlockAdr: number[] = [8, 9, 10]
    let TPrescalerReg = 0x2B
    let TxControlReg = 0x14
    let PICC_READ = 0x30
    let PICC_ANTICOLL = 0x93
    let PCD_RESETPHASE = 0x0F
    let temp = 0
    let val = 0
    let uid: number[] = []

    let returnLen = 0
    let returnData: number[] = []
    let status = 0
    let u = 0
    let ChkSerNum = 0
    let returnBits: any = null
    let recvData: number[] = []
    let PCD_IDLE = 0
    let d = 0

    let Status2Reg = 0x08
    let CommandReg = 0x01
    let BitFramingReg = 0x0D
    let MAX_LEN = 16
    let PCD_AUTHENT = 0x0E
    let PCD_TRANSCEIVE = 0x0C
    let PICC_REQIDL = 0x26
    let PICC_AUTHENT1A = 0x60

    let ComIrqReg = 0x04
    let DivIrqReg = 0x05
    let FIFODataReg = 0x09
    let FIFOLevelReg = 0x0A
    let ControlReg = 0x0C
    let Key = [255, 255, 255, 255, 255, 255]

    // --- Low-Level SPI- und Hilfsfunktionen ---
    function SetBits(reg: number, mask: number) {
        let tmp = SPI_Read(reg)
        SPI_Write(reg, tmp | mask)
    }

    function ClearBits(reg: number, mask: number) {
        let tmp = SPI_Read(reg)
        SPI_Write(reg, tmp & (~mask))
    }

    // Nutzt DigitalPin.P3 als NSS (Chip Select) für den Calliope Mini
    function SPI_Write(adr: number, value: number) {
        pins.digitalWritePin(DigitalPin.P3, 0)
        pins.spiWrite((adr << 1) & 0x7E)
        pins.spiWrite(value)
        pins.digitalWritePin(DigitalPin.P3, 1)
    }

    function SPI_Read(adr: number): number {
        pins.digitalWritePin(DigitalPin.P3, 0)
        pins.spiWrite(((adr << 1) & 0x7E) | 0x80)
        val = pins.spiWrite(0)
        pins.digitalWritePin(DigitalPin.P3, 1)
        return val
    }

    // Liest Daten von der Karte und dekodiert den Inhalt in einen Text
    function readFromCard(): string {
        let [reqStatus, Type2] = Request(PICC_REQIDL)
        if (reqStatus != 0) {
            return null;
        }

        [reqStatus, uid] = AvoidColl()
        if (reqStatus != 0) {
            return null;
        }

        let id = getIDNum(uid)
        TagSelect(uid)
        status = Authent(PICC_AUTHENT1A, 11, Key, uid)
        let data: number[] = []
        let text_read = ''
        let block: number[] = []
        if (status == 0) {
            for (let BlockNum of BlockAdr) {
                block = ReadRFID(BlockNum)
                if (block) {
                    data = data.concat(block)
                }
            }
            if (data) {
                for (let c of data) {
                    text_read = text_read.concat(String.fromCharCode(c))
                }
            }
        }
        Crypto1Stop()
        return text_read
    }

    // Schreibt den gegebenen Text auf die Karte und gibt die Karten-ID zurück.
    function writeToCard(txt: string): number {
        let [reqStatus, Type2] = Request(PICC_REQIDL)
        if (reqStatus != 0) {
            return null
        }
        [reqStatus, uid] = AvoidColl()
        if (reqStatus != 0) {
            return null
        }

        let id = getIDNum(uid)
        TagSelect(uid)
        status = Authent(PICC_AUTHENT1A, 11, Key, uid)
        ReadRFID(11)

        if (status == 0) {
            let data: number[] = []
            for (let i = 0; i < txt.length; i++) {
                data.push(txt.charCodeAt(i))
            }
            for (let j = txt.length; j < 48; j++) {
                data.push(32)
            }
            let b = 0
            for (let BlockNum2 of BlockAdr) {
                WriteRFID(BlockNum2, data.slice(b * 16, (b + 1) * 16))
                b++
            }
        }

        Crypto1Stop()
        serial.writeLine("Written to Card")
        return id
    }

    // Liest Daten aus einem bestimmten Block (Blockadresse) von der Karte.
    function ReadRFID(blockAdr: number): number[] {
        recvData = []
        recvData.push(PICC_READ)
        recvData.push(blockAdr)
        let pOut2 = CRC_Calculation(recvData)
        recvData.push(pOut2[0])
        recvData.push(pOut2[1])
        let [readStatus, retData, retLen] = MFRC522_ToCard(PCD_TRANSCEIVE, recvData)
        if (readStatus != 0) {
            serial.writeLine("Error while reading!")
        }
        if (retData.length != 16) {
            return null
        } else {
            return retData
        }
    }

    // Führt eine Kartenanfrage durch und liefert den "Bits"-Wert zurück.
    function Request(reqMode: number): [number, any] {
        let Type: number[] = []
        SPI_Write(BitFramingReg, 0x07)
        Type.push(reqMode)
        let [reqStatus, returnData, returnBits] = MFRC522_ToCard(PCD_TRANSCEIVE, Type)
        if ((reqStatus != 0) || (returnBits != 16)) {
            reqStatus = 2
        }
        return [reqStatus, returnBits]
    }

    // Schaltet die Antenne ein.
    function AntennaON() {
        temp = SPI_Read(TxControlReg)
        if (!(temp & 0x03)) {
            SetBits(TxControlReg, 0x03)
        }
    }

    // Führt eine Antikollisionsroutine durch und liefert den UID-Array der Karte.
    function AvoidColl(): [number, number[]] {
        let SerNum: number[] = []
        ChkSerNum = 0
        SPI_Write(BitFramingReg, 0)
        SerNum.push(PICC_ANTICOLL)
        SerNum.push(0x20)
        let [collStatus, returnData, returnBits] = MFRC522_ToCard(PCD_TRANSCEIVE, SerNum)
        if (collStatus == 0) {
            if (returnData.length == 5) {
                for (let k = 0; k <= 3; k++) {
                    ChkSerNum = ChkSerNum ^ returnData[k]
                }
                if (ChkSerNum != returnData[4]) {
                    collStatus = 2
                }
            } else {
                collStatus = 2
            }
        }
        return [collStatus, returnData]
    }

    // Beendet den Crypto1-Vorgang.
    function Crypto1Stop() {
        ClearBits(Status2Reg, 0x08)
    }

    // Authentifiziert einen Block mit dem übergebenen Schlüssel und der Serial-Nummer.
    function Authent(authMode: number, BlockAdr: number, Sectorkey: number[], SerNum: number[]): number {
        let buff: number[] = []
        buff.push(authMode)
        buff.push(BlockAdr)
        for (let l = 0; l < Sectorkey.length; l++) {
            buff.push(Sectorkey[l])
        }
        for (let m = 0; m < 4; m++) {
            buff.push(SerNum[m])
        }
        [status, returnData, returnLen] = MFRC522_ToCard(PCD_AUTHENT, buff)
        if (status != 0) {
            serial.writeLine("AUTH ERROR!")
        }
        if ((SPI_Read(Status2Reg) & 0x08) == 0) {
            serial.writeLine("AUTH ERROR2!")
        }
        return status
    }

    // Wandelt den UID-Array in eine Zahl um.
    function getIDNum(uid: number[]): number {
        let a = 0
        for (let e = 0; e < 5; e++) {
            a = a * 256 + uid[e]
        }
        return a
    }

    // Wählt die Karte anhand der Serial-Nummer aus.
    function TagSelect(SerNum: number[]): number {
        let buff: number[] = []
        buff.push(0x93)
        buff.push(0x70)
        for (let r = 0; r < 5; r++) {
            buff.push(SerNum[r])
        }
        let pOut = CRC_Calculation(buff)
        buff.push(pOut[0])
        buff.push(pOut[1])
        let [selStatus, returnData, returnLen] = MFRC522_ToCard(PCD_TRANSCEIVE, buff)
        if ((selStatus == 0) && (returnLen == 0x18)) {
            return returnData[0]
        } else {
            return 0
        }
    }

    // Berechnet die CRC für einen gegebenen Daten-Array.
    function CRC_Calculation(DataIn: number[]): number[] {
        ClearBits(DivIrqReg, 0x04)
        SetBits(FIFOLevelReg, 0x80)
        for (let s = 0; s < DataIn.length; s++) {
            SPI_Write(FIFODataReg, DataIn[s])
        }
        SPI_Write(CommandReg, 0x03)
        let t = 0xFF
        while (true) {
            let v = SPI_Read(DivIrqReg)
            t--
            if (!(t != 0 && !(v & 0x04))) {
                break
            }
        }
        let DataOut: number[] = []
        DataOut.push(SPI_Read(0x22))
        DataOut.push(SPI_Read(0x21))
        return DataOut
    }

    // Schreibt 16 Byte auf einen bestimmten Block der Karte.
    function WriteRFID(blockAdr: number, writeData: number[]): void {
        let buff: number[] = []
        let crc: number[] = []
        buff.push(0xA0)
        buff.push(blockAdr)
        crc = CRC_Calculation(buff)
        buff.push(crc[0])
        buff.push(crc[1])
        let [writeStatus, returnData, returnLen] = MFRC522_ToCard(PCD_TRANSCEIVE, buff)
        if ((writeStatus != 0) || (returnLen != 4) || ((returnData[0] & 0x0F) != 0x0A)) {
            writeStatus = 2
            serial.writeLine("ERROR")
        }
        if (writeStatus == 0) {
            let buff2: number[] = []
            for (let w = 0; w < 16; w++) {
                buff2.push(writeData[w])
            }
            crc = CRC_Calculation(buff2)
            buff2.push(crc[0])
            buff2.push(crc[1])
            let [status2, returnData2, returnLen2] = MFRC522_ToCard(PCD_TRANSCEIVE, buff2)
            if ((status2 != 0) || (returnLen2 != 4) || ((returnData2[0] & 0x0F) != 0x0A)) {
                serial.writeLine("Error while writing")
            } else {
                serial.writeLine("Data written")
            }
        }
    }

    // Sendet die Daten an das Modul und empfängt die Antwort.
    function MFRC522_ToCard(command: number, sendData: number[]): [number, number[], number] {
        returnData = []
        returnLen = 0
        status = 2
        let irqEN = 0x00
        let waitIRQ = 0x00
        let lastBits: number = 0
        let n = 0

        if (command == PCD_AUTHENT) {
            irqEN = 0x12
            waitIRQ = 0x10
        }
        if (command == PCD_TRANSCEIVE) {
            irqEN = 0x77
            waitIRQ = 0x30
        }

        SPI_Write(0x02, irqEN | 0x80)
        ClearBits(ComIrqReg, 0x80)
        SetBits(FIFOLevelReg, 0x80)
        SPI_Write(CommandReg, PCD_IDLE)

        for (let o = 0; o < sendData.length; o++) {
            SPI_Write(FIFODataReg, sendData[o])
        }
        SPI_Write(CommandReg, command)

        if (command == PCD_TRANSCEIVE) {
            SetBits(BitFramingReg, 0x80)
        }

        let p = 2000
        while (true) {
            n = SPI_Read(ComIrqReg)
            p--
            if (!(p != 0 && !(n & 0x01) && !(n & waitIRQ))) {
                break
            }
        }
        ClearBits(BitFramingReg, 0x80)

        if (p != 0) {
            if ((SPI_Read(0x06) & 0x1B) == 0x00) {
                status = 0
                if (n & irqEN & 0x01) {
                    status = 1
                }
                if (command == PCD_TRANSCEIVE) {
                    n = SPI_Read(FIFOLevelReg)
                    lastBits = SPI_Read(ControlReg) & 0x07
                    if (lastBits != 0) {
                        returnLen = (n - 1) * 8 + lastBits
                    } else {
                        returnLen = n * 8
                    }
                    if (n == 0) {
                        n = 1
                    }
                    if (n > MAX_LEN) {
                        n = MAX_LEN
                    }
                    for (let q = 0; q < n; q++) {
                        returnData.push(SPI_Read(FIFODataReg))
                    }
                }
            } else {
                status = 2
            }
        }

        return [status, returnData, returnLen]
    }

    // Intern genutzte Funktion, um die Karten-ID auszulesen.
    function readID(): number {
        [status, Type2] = Request(PICC_REQIDL)
        if (status != 0) {
            return null;
        }
        [status, uid] = AvoidColl()
        if (status != 0) {
            return null;
        }
        return getIDNum(uid);
    }

    // ============================================================================
    // Exportierte Funktionen als MakeCode-Blöcke
    // ============================================================================

    //% block="Initialize MFRC522 Module"
    //% weight=100
    export function Init(): void {
        // Für den Calliope Mini:
        // MOSI → C14, MISO → C15, SCK → C13
        // NSS → P3, RST → C4
        pins.spiPins(DigitalPin.C14, DigitalPin.C15, DigitalPin.C13)
        pins.spiFrequency(1000000)
        pins.spiFormat(8, 0)
        // Setze NSS (P3) und RST (C4)
        pins.digitalWritePin(DigitalPin.P3, 1)
        pins.digitalWritePin(DigitalPin.C4, 1)

        // Reset des Moduls
        SPI_Write(CommandReg, PCD_RESETPHASE)

        SPI_Write(0x2A, 0x8D)
        SPI_Write(0x2B, 0x3E)
        SPI_Write(0x2D, 30)
        SPI_Write(0x2E, 0)
        SPI_Write(0x15, 0x40)
        SPI_Write(0x11, 0x3D)
        AntennaON()
    }

    //% block="Read ID"
    //% weight=95
    export function getID(): number {
        let id = readID()
        while (!id) {
            id = readID()
            if (id != undefined) {
                return id;
            }
        }
        return id;
    }

    //% block="Read data"
    //% weight=90
    export function read(): string {
        let text = readFromCard()
        while (!text) {
            text = readFromCard()
            if (text != '') {
                return text;
            }
        }
        return text;
    }

    //% block="Write Data %text"
    //% weight=85
    export function write(text: string): void {
        let id = writeToCard(text)
        while (!id) {
            id = writeToCard(text)
            if (id != undefined) {
                return;
            }
        }
        return;
    }

    //% block="Turn off antenna"
    //% weight=80
    export function AntennaOff(): void {
        ClearBits(TxControlReg, 0x03)
    }
}
