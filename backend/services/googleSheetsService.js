// googleSheetsService.js
const { google } = require('googleapis');
const path = require('path');

class GoogleSheetsService {
    constructor() {
        this.auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, 'SheetsCred.env.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        
        this.sheets = null;
        this.SPREADSHEET_ID = process.env.SPREADSHEET_ID;
    }

    async initialize() {
        if (!this.sheets) {
            const auth = await this.auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth });
        }
    }

    async validateSheetName(sheetName) {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: this.SPREADSHEET_ID
        });
        
        const sheets = response.data.sheets.map(sheet => sheet.properties.title);
        if (!sheets.includes(sheetName)) {
            throw new Error(`Invalid farmer sheet: ${sheetName}. Available sheets: ${sheets.join(', ')}`);
        }
    }

    async getNextId(sheetName) {
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.SPREADSHEET_ID,
            range: `${sheetName}!A:A`,
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) return 1;
        
        const ids = rows.slice(1).map(row => parseInt(row[0])).filter(id => !isNaN(id));
        return ids.length > 0 ? Math.max(...ids) + 1 : 1;
    }

    async appendRow(sheetName, data) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        
        try {
            const id = await this.getNextId(sheetName);
            const rowWithId = [id, ...data];
            
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${sheetName}!A:K`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [rowWithId],
                },
            });
            
            return { success: true, id, data: rowWithId };
        } catch (error) {
            throw new Error(`Failed to append row: ${error.message}`);
        }
    }

    async getAllRecords(sheetName) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${sheetName}!A:K`,
                
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) return []; // Empty if only header row exists

            // First row is header, so start from index 1
            return rows.slice(1)
            .filter(row => row[0] !== undefined && row[0] !== null && row[0] !== '')
            .map(row => ({
                id: parseInt(row[0]),
                shipmentDate: row[1],
                cardId: row[2],
                harvestDate: row[3],
                palletNumber: row[4],
                kind: row[5],
                size: row[6],
                boxes: row[7],
                weight: row[8],
                destination: row[9],
                sent: row[10] == 'TRUE' ? true : false
            }));
        } catch (error) {
            throw new Error(`Failed to fetch records: ${error.message}`);
        }
    }

    async getLastPallet(sheetName) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        
        try {
            const records = await this.getAllRecords(sheetName);
            
            if (records.length === 0) {
                return 0; // Return 0 if no records exist
            }
            
            // Filter out any records where palletNumber is empty or not a number
            const validPalletNumbers = records
                .map(record => parseInt(record.palletNumber))
                .filter(num => !isNaN(num));
                
            if (validPalletNumbers.length === 0) {
                return 0; // Return 0 if no valid pallet numbers found
            }
            
            // Return the highest pallet number
            return Math.max(...validPalletNumbers);
            
        } catch (error) {
            throw new Error(`Failed to get last pallet number: ${error.message}`);
        }
    }

    async updateRowById(sheetName, id, updatedData) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${sheetName}!A:K`,
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => parseInt(row[0]) === id);
            
            if (rowIndex === -1) {
                throw new Error(`Row with ID ${id} not found in sheet ${sheetName}`);
            }

            const range = `${sheetName}!A${rowIndex + 1}:K${rowIndex + 1}`;
            const rowWithId = [id, ...updatedData];

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.SPREADSHEET_ID,
                range,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [rowWithId],
                },
            });

            return { success: true, id, data: rowWithId };
        } catch (error) {
            throw new Error(`Failed to update row: ${error.message}`);
        }
    }
}

module.exports = new GoogleSheetsService();