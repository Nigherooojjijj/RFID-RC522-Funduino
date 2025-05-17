    // (Annahme: Die Funktionen SPI_Write, SPI_Read, ClearBits, SetBits und
    // alle benötigten Konstanten wie CommandReg, PCD_TRANSCEIVE etc. sind
    // im ersten Teil definiert.)

    function MFRC522_ToCard(command: number, sendData: number[]): [number, number[], number] {
        let status = 2
        let returnData: number[] = []
        let returnLen = 0
        let irqEN = 0
        let waitIRQ = 0
        let n = 0
        // Beispielhafte Konfiguration der IRQ-Flags
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
                    let lastBits = SPI_Read(ControlReg) & 0x07
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
        let [status, returnData, returnLen] = MFRC522_ToCard(PCD_TRANSCEIVE, buff)
        if ((status == 0) && (returnLen == 0x18)) {
            return returnData[0]
        } else {
            return 0
        }
    }

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

    function WriteRFID(blockAdr: number, writeData: number[]): void {
        let buff: number[] = []
        let crc: number[] = []

        buff.push(0xA0)
        buff.push(blockAdr)
        crc = CRC_Calculation(buff)
        buff.push(crc[0])
        buff.push(crc[1])
        let [status, returnData, returnLen] = MFRC522_ToCard(PCD_TRANSCEIVE, buff)
        if ((status != 0) || (returnLen != 4) || ((returnData[0] & 0x0F) != 0x0A)) {
            status = 2
            serial.writeLine("ERROR")
        }

        if (status == 0) {
            let buff2: number[] = []
            for (let w = 0; w < 16; w++) {
                buff2.push(writeData[w])
            }
            crc = CRC_Calculation(buff2)
            buff2.push(crc[0])
            buff2.push(crc[1])
            let [status, returnData, returnLen] = MFRC522_ToCard(PCD_TRANSCEIVE, buff2)
            if ((status != 0) || (returnLen != 4) || ((returnData[0] & 0x0F) != 0x0A)) {
                serial.writeLine("Error while writing")
            } else {
                serial.writeLine("Data written")
            }
        }
    }

    function getIDNum(uid: number[]): number {
        let a = 0
        for (let e = 0; e < 5; e++) {
            a = a * 256 + uid[e]
        }
        return a
    }

    function readID(): number {
        let [status, Type2] = Request(PICC_REQIDL)
        if (status != 0) {
            return null
        }
        let [status2, uid] = AvoidColl()
        if (status2 != 0) {
            return null
        }
        return getIDNum(uid)
    }

    /*
     * Initial setup für den Calliope Mini
     */
    //% block="Initialize MFRC522 Module"
    //% weight=100
    export function Init(): void {
        // Für den Calliope Mini:
        // MOSI → C14, MISO → C15, SCK → C13
        // NSS → P3, RST → C4
        pins.spiPins(DigitalPin.C14, DigitalPin.C15, DigitalPin.C13);
        pins.spiFrequency(1000000);
        pins.spiFormat(8, 0);
        // Setze NSS und RST korrekt
        pins.digitalWritePin(DigitalPin.P3, 1);
        pins.digitalWritePin(DigitalPin.C4, 1);

        // Reset des Moduls
        SPI_Write(CommandReg, PCD_RESETPHASE);

        SPI_Write(0x2A, 0x8D);
        SPI_Write(0x2B, 0x3E);
        SPI_Write(0x2D, 30);
        SPI_Write(0x2E, 0);
        SPI_Write(0x15, 0x40);
        SPI_Write(0x11, 0x3D);
        antennaOn();
    }

    /*
     * Funktion, um die ID von der Karte auszulesen.
     */
    //% block="Read ID"
    //% weight=95
    export function getID(): number {
        let id = readID();
        while (!id) {
            id = readID();
            if (id != undefined) {
                return id;
            }
        }
        return id;
    }

    /*
     * Funktion zur Ausgabe von Daten von der Karte.
     */
    //% block="Read data"
    //% weight=90
    export function read(): string {
        let text = readFromCard();
        while (!text) {
            let text = readFromCard();
            if (text != '') {
                return text;
            }
        }
        return text;
    }

    /*
     * Funktion zum Schreiben von Daten auf die Karte.
     */
    //% block="Write Data %text"
    //% weight=85
    export function write(text: string): void {
        let id = writeToCard(text);
        while (!id) {
            let id = writeToCard(text);
            if (id != undefined) {
                return;
            }
        }
        return;
    }

    /*
     * Schaltet die RFID-Antenne aus.
     */
    //% block="Turn off antenna"
    //% weight=80
    export function AntennaOff(): void {
        ClearBits(TxControlReg, 0x03);
    }
}
