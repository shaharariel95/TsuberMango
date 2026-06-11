// googleSheetsService.js
const { google } = require('googleapis');
const path = require('path');
const logger = require("../utils/logger");

const COL_INDEX = {
    SENT: 10,
    MARK: 12
};


class GoogleSheetsService {
    constructor() {
        this.auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, 'SheetsCred.env.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        
        this.sheets = null;
        this.SPREADSHEET_ID = process.env.SPREADSHEET_ID;

        // In-memory cache storage
        this.cachedSheetNames = null;               // Array of sheet names
        this.cachedAuditSheetExists = new Set();    // Set of verified audit sheet names
        this.cachedFarmerRecords = new Map();       // Map of farmerName -> { records, timestamp }
        this.activeRecordFetches = new Map();       // Map of farmerName -> Promise (coalescing)
        this.CACHE_TTL_MS = 5 * 60 * 1000;          // 5 minutes Time-to-Live
        // Per-farmer append locks: serializes concurrent appendRow calls so getNextId
        // never races against an in-flight write from the same process instance.
        this.appendLocks = new Map();               // Map of farmerName -> Promise
    }

    async initialize() {
        if (!this.sheets) {
            const auth = await this.auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth });
        }
    }

    async validateSheetName(sheetName) {
        // If sheet names are cached, check in-memory first
        if (this.cachedSheetNames && this.cachedSheetNames.includes(sheetName)) {
            logger.info(`[CACHE HIT] Validated sheet name: "${sheetName}" from in-memory cache`);
            return;
        }

        logger.info(`[CACHE MISS] Fetching spreadsheet metadata to validate sheet name: "${sheetName}"`);
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: this.SPREADSHEET_ID
        });
        
        this.cachedSheetNames = response.data.sheets.map(sheet => sheet.properties.title);
        if (!this.cachedSheetNames.includes(sheetName)) {
            throw new Error(`Invalid farmer sheet: ${sheetName}. Available sheets: ${this.cachedSheetNames.join(', ')}`);
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

        // Serialize appends per farmer: each call waits for the previous one to
        // finish before running getNextId, so two concurrent creates can never
        // read the same max ID and produce duplicate row IDs.
        const prev = this.appendLocks.get(sheetName) || Promise.resolve();
        const current = prev.then(async () => {
            const id = await this.getNextId(sheetName);
            const rowWithId = [id, ...data];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${sheetName}!A:N`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [rowWithId],
                },
            });

            this.invalidateFarmerCache(sheetName);
            return { success: true, id, data: rowWithId };
        });

        // Store the chain but swallow rejections so a failed append doesn't
        // permanently break the lock for this farmer.
        this.appendLocks.set(sheetName, current.catch(() => {}));

        try {
            return await current;
        } catch (error) {
            throw new Error(`Failed to append row: ${error.message}`);
        }
    }

    async getAllRecords(sheetName) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        
        // 1. Check in-memory records cache
        const cached = this.cachedFarmerRecords.get(sheetName);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
            logger.info(`[CACHE HIT] Served ${cached.records.length} records for farmer "${sheetName}" from in-memory cache`);
            return cached.records;
        }

        // 2. Check active fetches (Promise coalescing/deduplication to solve Dashboard concurrent requests storm)
        if (this.activeRecordFetches.has(sheetName)) {
            logger.info(`[CACHE COALESCE] Waiting on active Google Sheets fetch for farmer "${sheetName}"`);
            return this.activeRecordFetches.get(sheetName);
        }

        logger.info(`[CACHE MISS] Fetching records from Google Sheets API for farmer: "${sheetName}"`);
        const fetchPromise = (async () => {
            try {
                const response = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.SPREADSHEET_ID,
                    range: `${sheetName}!A:O`,
                });

                const rows = response.data.values || [];
                if (rows.length <= 1) return []; // Empty if only header row exists

                const records = rows.slice(1)
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
                        editedBy: row[13] || '',
                        editedAt: row[14] || '',
                    }));

                // Update cache
                this.cachedFarmerRecords.set(sheetName, { records, timestamp: Date.now() });
                return records;
            } finally {
                // Always cleanup active fetch tracker
                this.activeRecordFetches.delete(sheetName);
            }
        })();

        this.activeRecordFetches.set(sheetName, fetchPromise);
        return fetchPromise;
    }

    async getRowsByPallet(sheetName, palletNumber) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        logger.info(`getRowsByPallet called for sheet: ${sheetName}, palletNumber: ${palletNumber}`);

        try {
            const records = await this.getAllRecords(sheetName);

            const filtered = records.filter(
                record => String(record.palletNumber) === String(palletNumber)
            );

            if (filtered.length === 0) {
                throw new Error(`Pallet ${palletNumber} not found in sheet ${sheetName}`);
            }

            return filtered;
        } catch (error) {
            logger.error(`getRowsByPallet failed for sheet: ${sheetName}, palletNumber: ${palletNumber} — ${error.message}`);
            throw new Error('Failed to get records by pallet: ' + error.message);
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
        if (!sheet) return null;
        return sheet.properties.sheetId;
    }

    async addSheet(sheetName) {
        await this.initialize();

        // Clear caches
        this.cachedSheetNames = null;
        this.cachedAuditSheetExists.clear();
        this.cachedFarmerRecords.clear();
        this.activeRecordFetches.clear();

        // 1. Create the sheet
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.SPREADSHEET_ID,
            requestBody: {
                requests: [{
                    addSheet: {
                        properties: {
                            title: sheetName,
                            gridProperties: {
                                rowCount: 1000,
                                columnCount: 20
                            }
                        }
                    }
                }]
            }
        });

        // 2. Add headers
        const headers = ["ID", "תאריך משלוח", "מספר תעודה", "תאריך קטיף", "מספר משטח", "זן", "גודל", "ארגזים", "משקל", "יעד", "נשלח", "גדעון", "סימון"];
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.SPREADSHEET_ID,
            range: `${sheetName}!A1:M1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [headers]
            }
        });

        return { success: true };
    }

    async deleteSheet(sheetName) {
        await this.initialize();
        const sheetId = await this.getSheetIdByName(sheetName);
        if (!sheetId) throw new Error(`Sheet ${sheetName} not found`);

        // Clear caches
        this.cachedSheetNames = null;
        this.cachedAuditSheetExists.clear();
        this.cachedFarmerRecords.clear();
        this.activeRecordFetches.clear();

        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.SPREADSHEET_ID,
            requestBody: {
                requests: [{
                    deleteSheet: {
                        sheetId: sheetId
                    }
                }]
            }
        });

        return { success: true };
    }

    async updateRowsByIds(sheetName, ids, updatedDataArray) {
        await this.initialize();
        await this.validateSheetName(sheetName);
        logger.info(`updateing rows for farmer ${sheetName} with ids: `, ids)

        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.SPREADSHEET_ID,
            range: `${sheetName}!A:O`,
        });

        const rows = response.data.values || [];
        const updates = [];

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const updatedData = updatedDataArray[i];

            const rowIndex = rows.findIndex(row => parseInt(row[0]) === id);

            if (rowIndex === -1) {
                throw new Error(`Row with ID ${id} not found in sheet ${sheetName}`);
            }

            const rowWithId = [id, ...updatedData];

            updates.push({
                range: `${sheetName}!A${rowIndex + 1}:O${rowIndex + 1}`,
                values: [rowWithId],
            });
        }

        if (updates.length > 0) {
            await this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: this.SPREADSHEET_ID,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: updates
                },
            });
        }

        this.invalidateFarmerCache(sheetName);
        return { success: true, message: 'Rows updated successfully' };
    }
    

    async updateRowById(sheetName, id, updatedData) {
        await this.initialize();
        await this.validateSheetName(sheetName);

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${sheetName}!A:O`,
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => parseInt(row[0]) === id);

            if (rowIndex === -1) {
                throw new Error(`Row with ID ${id} not found in sheet ${sheetName}`);
            }

            const range = `${sheetName}!A${rowIndex + 1}:O${rowIndex + 1}`;
            const rowWithId = [id, ...updatedData];

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.SPREADSHEET_ID,
                range,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [rowWithId],
                },
            });

            this.invalidateFarmerCache(sheetName);
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
                    rows[rowIndex][COL_INDEX.SENT] = newStatus;
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
                valueInputOption: 'USER_ENTERED',
            };

            await this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: this.SPREADSHEET_ID,
                requestBody: batchUpdateRequest,
            });

            this.invalidateFarmerCache(sheetName);
            return updates.map(update => ({
                id: update.values[0][0],
                sent: update.values[0][COL_INDEX.SENT],
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
                    rows[rowIndex][COL_INDEX.MARK] = newStatus;
                    updates.push({
                        range: `${sheetName}!A${rowIndex + 1}:M${rowIndex + 1}`,
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
                valueInputOption: 'USER_ENTERED',
            };

            await this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: this.SPREADSHEET_ID,
                requestBody: batchUpdateRequest,
            });

            this.invalidateFarmerCache(sheetName);
            return updates.map(update => ({
                id: update.values[0][0],
                sent: update.values[0][COL_INDEX.SENT],
            })); // Return updated rows with their IDs and new status
        } catch (error) {
            throw new Error(`Failed to update pallets: ${error.message}`);
        }
    }

    async appendAuditLog(sheetName, entry) {
        try {
            await this.initialize();
            const auditSheetName = `${sheetName}_audit`;

            // Ensure the audit sheet exists; create it if not
            let auditExists = true;
            if (this.cachedAuditSheetExists.has(auditSheetName)) {
                logger.info(`[CACHE HIT] Audit sheet "${auditSheetName}" verified from in-memory cache`);
            } else {
                try {
                    await this.validateSheetName(auditSheetName);
                    this.cachedAuditSheetExists.add(auditSheetName);
                } catch (e) {
                    if (e.message.includes('Invalid farmer sheet')) {
                        auditExists = false;
                    } else {
                        throw e;
                    }
                }
            }

            if (!auditExists) {
                logger.info(`[CACHE MISS] Creating new audit sheet: "${auditSheetName}"`);
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.SPREADSHEET_ID,
                    requestBody: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: auditSheetName,
                                    gridProperties: { rowCount: 1000, columnCount: 10 }
                                }
                            }
                        }]
                    }
                });

                // Write header row
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.SPREADSHEET_ID,
                    range: `${auditSheetName}!A1:F1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [["ID", "מזהה רשומה", "מספר משטח", "פעולה", "בוצע על ידי", "תאריך ושעה"]]
                    }
                });

                logger.info(`Created audit sheet: ${auditSheetName}`);
                
                // Keep sheet names cache and audit existence cache updated
                if (this.cachedSheetNames) {
                    this.cachedSheetNames.push(auditSheetName);
                }
                this.cachedAuditSheetExists.add(auditSheetName);
            }

            // Get next audit ID
            const idResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${auditSheetName}!A:A`,
            });
            const idRows = idResponse.data.values || [];
            const auditIds = idRows.slice(1).map(r => parseInt(r[0])).filter(n => !isNaN(n));
            const nextAuditId = auditIds.length > 0 ? Math.max(...auditIds) + 1 : 1;

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `${auditSheetName}!A:F`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[nextAuditId, entry.recordId, entry.palletNumber, entry.action, entry.editedBy, entry.editedAt]]
                }
            });

            logger.info(`Audit log appended to ${auditSheetName}: record ${entry.recordId}, action ${entry.action} by ${entry.editedBy}`);
        } catch (error) {
            logger.error(`appendAuditLog failed for sheet ${sheetName}: ${error.message}`);
            // Do NOT rethrow — audit failures must never break the main flow
        }
    }

    invalidateFarmerCache(sheetName) {
        if (this.cachedFarmerRecords.has(sheetName)) {
            this.cachedFarmerRecords.delete(sheetName);
            logger.info(`[CACHE INVALIDATION] Cleared in-memory records cache for farmer: "${sheetName}" due to write operation`);
        }
    }

}

module.exports = new GoogleSheetsService();