// googleSheetsService.js
const { google } = require('googleapis');
const path = require('path');
const logger = require("../utils/logger");


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
                range: `${sheetName}!A:L`,
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
                range: `${sheetName}!A:M`,
                
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
                sent: row[10] == 'TRUE' ? true : false,
                gidon: row[11] == 'TRUE' ? true : false,
                mark: row[12] == 'TRUE' ? true : false,
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

    // Helper to get sheetId by sheetName
    async getSheetIdByName(sheetName) {
        await this.initialize();
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: this.SPREADSHEET_ID
        });
        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) throw new Error(`Sheet with name ${sheetName} not found`);
        return sheet.properties.sheetId;
    }

    async updateRowsByIds(sheetName, ids, updatedDataArray) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        logger.info(`updateing rows for farmer ${sheetName} with ids: `, ids)
        const requests = [];

        // Fetch all rows once
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.SPREADSHEET_ID,
            range: `${sheetName}!A:M`,
        });

        const rows = response.data.values || [];
        // Fetch the sheetId for the correct sheet
        const sheetId = await this.getSheetIdByName(sheetName);

        // Prepare the batch update requests
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const updatedData = updatedDataArray[i];

            // Find the row to update
            const rowIndex = rows.findIndex(row => parseInt(row[0]) === id);

            if (rowIndex === -1) {
                throw new Error(`Row with ID ${id} not found in sheet ${sheetName}`);
            }

            const rowWithId = [id, ...updatedData];

            // Prepare the update request for this row
            requests.push({
                updateCells: {
                    rows: [
                        {
                            values: rowWithId.map(value => ({
                                userEnteredValue: typeof value === 'boolean' 
                                    ? { boolValue: value }
                                    : { stringValue: String(value) }
                            }))
                        }
                    ],
                    fields: "userEnteredValue",
                    start: {
                        sheetId: sheetId, // <-- Fix: specify the correct sheetId
                        rowIndex: rowIndex,
                        columnIndex: 0
                    }
                }
            });
        }

        // Perform the batch update for all rows
        if (requests.length > 0) {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.SPREADSHEET_ID,
                requestBody: { requests },
            });
        }

        return { success: true, message: 'Rows updated successfully' };
    }
    

    async updateRowById(sheetName, id, updatedData) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${sheetName}!A:M`,
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => parseInt(row[0]) === id);
            
            if (rowIndex === -1) {
                throw new Error(`Row with ID ${id} not found in sheet ${sheetName}`);
            }

            const range = `${sheetName}!A${rowIndex + 1}:M${rowIndex + 1}`;
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

    async updateSentStatusForPallets(sheetName, palletIds, newStatus) {
        await this.initialize();
        await this.validateSheetName(sheetName);

        try {
            // Fetch the entire sheet
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${sheetName}!A:M`,
            });
            
            const rows = response.data.values || [];
            const updates = [];

            // Prepare updated rows
            palletIds.forEach(palletId => {
                const rowIndex = rows.findIndex(row => parseInt(row[0]) === palletId); // Assuming ID is in column A
                if (rowIndex !== -1) {
                    rows[rowIndex][10] = newStatus;
                    updates.push({
                        range: `${sheetName}!A${rowIndex + 1}:L${rowIndex + 1}`,
                        values: [rows[rowIndex]],
                    });
                }
            });
            
            if (!updates.length) {
                throw new Error('No matching pallet IDs found for update');
            }
    
            // Batch update
            const batchUpdateRequest = {
                data: updates,
                valueInputOption: 'RAW',
            };
    
            await this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: this.SPREADSHEET_ID,
                requestBody: batchUpdateRequest,
            });
    
            return updates.map(update => ({
                id: update.values[0][0],
                sent: update.values[0][10],
            })); // Return updated rows with their IDs and new status
        } catch (error) {
            throw new Error(`Failed to update pallets: ${error.message}`);
        }
    }    
    
    async updateSendToDestinationPallets(sheetName, palletIds, newStatus) {
        await this.initialize();
        await this.validateSheetName(sheetName);

        try {
            // Fetch the entire sheet
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${sheetName}!A:M`,
            });
            
            const rows = response.data.values || [];
            const updates = [];
            palletIds.forEach(palletId => {
                const rowIndex = rows.findIndex(row => parseInt(row[0]) === palletId); // Assuming ID is in column A
                if (rowIndex !== -1) {
                    rows[rowIndex][12] = newStatus;
                    updates.push({
                        range: `${sheetName}!A${rowIndex + 1}:M${rowIndex + 1}`,
                        values: [rows[rowIndex]],
                    });
                }
            });
            console.log(`updates`, updates)
            if (!updates.length) {
                throw new Error('No matching pallet IDs found for update');
            }
    
            // Batch update
            const batchUpdateRequest = {
                data: updates,
                valueInputOption: 'RAW',
            };
    
            await this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: this.SPREADSHEET_ID,
                requestBody: batchUpdateRequest,
            });
    
            return updates.map(update => ({
                id: update.values[0][0],
                sent: update.values[0][10],
            })); // Return updated rows with their IDs and new status
        } catch (error) {
            throw new Error(`Failed to update pallets: ${error.message}`);
        }
    }

}

module.exports = new GoogleSheetsService();