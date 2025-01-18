const { google } = require('googleapis');
const path = require('path');

class ShippingLabelsService {
    constructor() {
        this.auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, 'SheetsCred.env.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        this.sheets = null;
        this.SPREADSHEET_ID = process.env.SHIPPING_LABELS_ID; // New spreadsheet ID
    }

    async initialize() {
        if (!this.sheets) {
            console.log('Initializing Google Sheets client...');
            const auth = await this.auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth });
            console.log('Google Sheets client initialized.');
        }
    }

    async getAndIncrementHighestId() {
        await this.initialize();

        try {
            console.log('Fetching current highest ID from cell DE7...');
            // Fetch the current highest ID from cell DE7 on the "base" sheet
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: 'base!D7',
            });

            const value = response.data.values?.[0]?.[0];
            let currentId = parseInt(value, 10);
            console.log(`Current ID from base sheet: ${currentId}`);

            if (isNaN(currentId)) {
                throw new Error(`Invalid ID in cell DE7 of sheet "base"`);
            }

            // Increment the ID
            currentId += 1;
            console.log(`Incremented ID: ${currentId}`);

            // Update the new ID back to cell DE7 in the "base" sheet
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.SPREADSHEET_ID,
                range: 'base!D7',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[currentId]],
                },
            });

            console.log('ID updated successfully in base sheet.');
            return currentId; // Return the new ID
        } catch (error) {
            console.error(`Failed to retrieve or update ID in cell DE7: ${error.message}`);
            throw new Error(`Failed to retrieve or update ID in cell DE7: ${error.message}`);
        }
    }

    async copyPageWithNewId(baseSheetName, newSheetName) {
        await this.initialize();

        try {
            console.log(`Fetching spreadsheet details to copy sheet "${baseSheetName}"...`);
            // Fetch the spreadsheet details
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.SPREADSHEET_ID,
            });

            const sheets = response.data.sheets;
            const baseSheet = sheets.find(sheet => sheet.properties.title === baseSheetName);

            if (!baseSheet) {
                throw new Error(`Sheet "${baseSheetName}" not found.`);
            }

            console.log(`Found sheet "${baseSheetName}", starting duplication process...`);
            // Duplicate the "base" sheet and assign it the new name
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.SPREADSHEET_ID,
                requestBody: {
                    requests: [
                        {
                            duplicateSheet: {
                                sourceSheetId: baseSheet.properties.sheetId,
                                newSheetName,
                            },
                        },
                    ],
                },
            });


            const res = await this.sheets.spreadsheets.get({
                spreadsheetId: this.SPREADSHEET_ID
            });

            const newSheet = res.data.sheets.find(sheet => sheet.properties.title === newSheetName);
            if (!newSheet) {
                throw new Error(`New sheet with name "${newSheetName}" not found`);
            }
    
            const newSheetId = newSheet.properties.sheetId;
            return {'id':newSheetId, 'name': newSheetName}; // Return the new sheet name
        } catch (error) {
            console.error(`Failed to copy page: ${error.message}`);
            throw new Error(`Failed to copy page: ${error.message}`);
        }
    }

    async writeShippingDataToSheet(newSheetName, newSheetId, palletData) {
        await this.initialize();
    
        try {
            console.log(`Writing data to sheet "${newSheetName}"...`);
            
            // Check if all pallets have the same destination
            const allDestinations = palletData.map(item => item.destination);
            const uniqueDestinations = [...new Set(allDestinations)];
            
            // If there's more than one destination, throw an error
            if (uniqueDestinations.length > 1) {
                throw new Error('Pallets have different destinations. Please verify.');
            }
    
            const destination = uniqueDestinations[0]; // Destination for B8
            console.log(palletData)
            // Prepare data for each pallet, starting from row 11
            const rows = palletData.map((item, index) => [
                '', // Column A (if necessary, otherwise remove this)
                '', // Column B (if necessary, otherwise remove this)
                '', // Column C (if necessary, otherwise remove this)
                item.weight,  // Column D
                item.boxes,   // Column E
                '',           // Column F (if necessary, otherwise remove this)
                '',           // Column G (if necessary, otherwise remove this)
                item.size,    // Column H
                item.kind,    // Column I
                item.palletNumber,  // Column J
                '',           // Column K (if necessary, otherwise remove this)
                '',           // Column L (if necessary, otherwise remove this)
            ]);
            console.log(rows)
            // Create the batch update request
            const requests = [
                // Update the destination in B8
                {
                    updateCells: {
                        rows: [
                            {
                                values: [
                                    { userEnteredValue: { stringValue: destination } }
                                ]
                            }
                        ],
                        fields: 'userEnteredValue',
                        start: {
                            sheetId: newSheetId,
                            rowIndex: 7,  // Row B8 (0-indexed, so 7 is B8)
                            columnIndex: 1  // Column B (0-indexed, so 1 is B)
                        }
                    }
                },
                // Insert pallet data starting from row 11
                {
                    updateCells: {
                        rows: rows.map(row => ({
                            values: row.map(value => ({
                                userEnteredValue: { stringValue: String(value) }
                            }))
                        })),
                        fields: 'userEnteredValue',
                        start: {
                            sheetId: newSheetId,
                            rowIndex: 10, // Row 11 (0-indexed, so 10 is row 11)
                            columnIndex: 0  // Column A
                        }
                    }
                }
            ];
    
            // Execute the batch update request
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.SPREADSHEET_ID,
                requestBody: {
                    requests
                }
            });
    
            console.log('Shipping data written successfully.');
    
            return true; // Returning true after successful operation
        } catch (error) {
            console.error(`Failed to write data to sheet: ${error.message}`);
            throw new Error(`Failed to write data to sheet: ${error.message}`);
        }
    }
}

module.exports = new ShippingLabelsService();
