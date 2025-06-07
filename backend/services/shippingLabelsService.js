const { google } = require('googleapis');
const path = require('path');
const logger = require('../utils/logger');

const FARMER_SPREADSHEET_IDS = {
    'גבי צוברי': process.env.SHIPPING_LABELS_ID_TSUBERI,
    'אבנר לוי': process.env.SHIPPING_LABELS_ID_AVNER,
    'עידן לוי': process.env.SHIPPING_LABELS_ID_IDAN,
    'גמליאל': process.env.SHIPPING_LABELS_ID_PESAH,
    'איתי קופלר': process.env.SHIPPING_LABELS_ID_KOPLER,
    'עטר שחק': process.env.SHIPPING_LABELS_ID_SHAHAK,
};

function getSpreadsheetIdByFarmer(farmer) {
    if (!farmer) return process.env.SHIPPING_LABELS_ID_TSUBERI;
    return FARMER_SPREADSHEET_IDS[farmer.trim()] || process.env.SHIPPING_LABELS_ID_TSUBERI;
}

class ShippingLabelsService {
    constructor() {
        this.auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, 'SheetsCred.env.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        this.sheets = null;
    }
    async initialize() {
        if (!this.sheets) {
            logger.info('Initializing Google Sheets client...');
            const auth = await this.auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth });
            logger.info('Google Sheets client initialized.');
        }
    }

    async getAndIncrementHighestId(farmer) {
        await this.initialize();
        const spreadsheetId = getSpreadsheetIdByFarmer(farmer);

        try {
            logger.info('Fetching current highest ID from cell DE7...');
            // Fetch the current highest ID from cell DE7 on the "base" sheet
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'base!D7',
            });

            const value = response.data.values?.[0]?.[0];
            let currentId = parseInt(value, 10);
            logger.info(`Current ID from base sheet: ${currentId}`);

            if (isNaN(currentId)) {
                throw new Error(`Invalid ID in cell DE7 of sheet "base"`);
            }

            // Increment the ID
            currentId += 1;
            logger.info(`Incremented ID: ${currentId}`);

            // Update the new ID back to cell DE7 in the "base" sheet
            await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'base!D7',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[currentId]],
                },
            });

            logger.info('ID updated successfully in base sheet.');
            return currentId; // Return the new ID
        } catch (error) {
            throw new Error(`Failed to retrieve or update ID in cell DE7: ${error.message}`);
        }
    }

    async copyPageWithNewId(farmer, baseSheetName, newSheetName) {
        await this.initialize();
        const spreadsheetId = getSpreadsheetIdByFarmer(farmer);

        try {
            logger.info(`Fetching spreadsheet details to copy sheet "${baseSheetName}"...`);
            // Fetch the spreadsheet details
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId,
            });

            const sheets = response.data.sheets;
            const baseSheet = sheets.find(sheet => sheet.properties.title === baseSheetName);

            if (!baseSheet) {
                throw new Error(`Sheet "${baseSheetName}" not found.`);
            }

            logger.info(`Found sheet "${baseSheetName}", starting duplication process...`);
            // Duplicate the "base" sheet and assign it the new name
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
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
                spreadsheetId
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

    async writeShippingDataToSheet(farmer, newSheetName, newSheetId, palletData) {
        await this.initialize();
        const spreadsheetId = getSpreadsheetIdByFarmer(farmer);
    
        try {
            logger.info(`Writing data to sheet "${newSheetName}"...`);
            
            // Check if all pallets have the same destination
            const allDestinations = palletData.map(item => item.destination);
            const uniqueDestinations = [...new Set(allDestinations)];
            
            // If there's more than one destination, throw an error
            if (uniqueDestinations.length > 1) {
                throw new Error('Pallets have different destinations. Please verify.');
            }
    
            const destination = uniqueDestinations[0]; // Destination for B8
            // Prepare data for each pallet, starting from row 11
            const seenPalletNumbers = new Set();
            const rows = palletData.map((item, index) => [
                '', // Column A (if necessary, otherwise remove this)
                '', // Column B (if necessary, otherwise remove this)
                seenPalletNumbers.has(item.palletNumber) ? '' : (seenPalletNumbers.add(item.palletNumber), 1), // Column C (1 for the first instance of a unique pallet number)
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

            const shipmentDate = palletData[0]?.shipmentDate ? palletData[0]?.shipmentDate : '';

            // Update the shipment date in B6
            const requests = [
                // Update the shipment date in B6
                {
                    updateCells: {
                        rows: [
                            {
                                values: [
                                    { userEnteredValue: { stringValue: shipmentDate } }
                                ]
                            }
                        ],
                        fields: 'userEnteredValue',
                        start: {
                            sheetId: newSheetId,
                            rowIndex: 5,  // Row B6 (0-indexed, so 5 is B6)
                            columnIndex: 1  // Column B (0-indexed, so 1 is B)
                        }
                    }
                },
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
                },
                // Update the total unique wooden pallets in C24
                {
                    updateCells: {
                        rows: [
                            {
                                values: [
                                    { userEnteredValue: { formulaValue: `=COUNTA(UNIQUE(J11:J${10 + rows.length}))` } }
                                ]
                            }
                        ],
                        fields: 'userEnteredValue',
                        start: {
                            sheetId: newSheetId,
                            rowIndex: 23, // Row 24 (0-indexed, so 23 is row 24)
                            columnIndex: 2  // Column C
                        }
                    }
                }
            ];
    
            // Execute the batch update request
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests
                }
            });
    
            logger.info('Shipping data written successfully.');
    
            return true; // Returning true after successful operation
        } catch (error) {
            console.error(`Failed to write data to sheet: ${error.message}`);
            throw new Error(`Failed to write data to sheet: ${error.message}`);
        }
    }
}

module.exports = new ShippingLabelsService();
